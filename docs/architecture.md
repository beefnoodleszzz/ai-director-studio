# AI Director Studio — 架构说明

> 更新时间：2026-05-14  
> 状态：反映当前已实现的真实架构，不含未实现功能

---

## 1. 系统定位

本地单机运行的 AI 短剧/漫剧生产工具。核心设计原则：

- **本地优先**：所有数据存储在本机 SQLite，不依赖云端持久化
- **资产驱动**：角色、风格、模板作为可复用资产而非一次性输入
- **导演控制**：每个生成步骤都支持人工审核、替换、废弃、重做
- **质量可度量**：通过 failTags、评分、Provider 统计形成质量飞轮

---

## 2. 技术栈

| 层次 | 技术选型 |
|---|---|
| **框架** | Next.js 16 App Router（Server + Client 混合）|
| **数据库** | SQLite + Prisma ORM |
| **UI** | Tailwind CSS v4 + shadcn/ui |
| **客户端状态** | Zustand |
| **媒体处理** | FFmpeg（视频组装）、Sharp（漫剧图像合成）|
| **任务队列** | p-queue + GenerationTask 持久化表 |

---

## 3. 数据模型

```
Project
  ├── StyleBible             风格圣经（1:1）
  ├── CharacterBible[]       角色档案
  │     ├── VoiceProfile    声音档案（1:1）
  │     └── CharacterAsset[] 参考图资产
  └── Episode[]
        └── Scene[]
              └── Shot[]
                    └── Take[]
                          └── Review[]
```

### 关键状态字段

| 模型 | 关键状态 | 含义 |
|---|---|---|
| Take | `isAdopted` | 当前选定用于下游生成/导出的版本 |
| Take | `isDiscarded` | 已废弃，不参与 QA/统计/导出 |
| Review | `verdict` | `pass` / `warn` / `fail` |
| Review | `suggestion` | `adopt` / `accept-minor` / `must-redo` / `change-provider` |
| GenerationTask | `status` | `queued → running → retrying → completed / failed / cancelled` |

---

## 4. 核心工作流

### 4.1 短剧生产流程

```
剧本输入
  → ScriptBreakdown（AI 拆分为 Scene+Shot）
  → ImageGeneration（生成多个候选 Take）
  → 人工审核（QA / adopt / discard）
  → VideoGeneration（基于 adopted image take）
  → AudioGeneration（TTS 对白）
  → Assembly（FFmpeg 合成 MP4）
```

### 4.2 漫剧生产流程

```
复用 Shot + adopted image Take
  → 选择网格模板（MangaTemplate）
  → LayoutEngine（分配镜头到格子，生成气泡规格）
  → ExportEngine（Sharp 合成，SVG 气泡覆盖）
  → 合并为竖版长图
```

### 4.3 Provider 推荐飞轮

```
Take 生成
  → QA 评审（写入 Review.failTags + verdict）
  → ProviderBenchmark 聚合统计
  → ProviderRecommender 计算推荐分
  → 镜头工作台展示推荐值
```

---

## 5. API 路由结构

```
/api/projects/[id]/
  characters/[charId]/
    assets/            角色参考图 CRUD
  style-bible/         风格圣经 CRUD
  episodes/[epId]/
    scenes/[scId]/
      shots/reorder/   镜头排序
      batch-generate/  场次批量生成
      emotion/         场次情绪弧更新
  qa/                  QA 列表 + 接受瑕疵
  qa/batch-retry/      批量重做失败 take
  benchmark/           Provider 统计
  consistency/         角色一致性报告
  dashboard/           生产指标汇总
  recommend-provider/  Provider 推荐
  templates/           Prompt 模板 CRUD
  templates/stats/     模板效果统计
  templates/clone-from-global/  从全局库导入

/api/templates/global/ 全局模板库

/api/shots/[shotId]/
  takes/[takeId]/      Take 更新（discard）
  dialogue/            句级对白修正
  adopt/               采用指定 Take

/api/task/
  status/              任务列表查询/取消
  retry/               失败任务重试

/api/export/manga/     漫剧导出
/api/generate/
  image/ video/ audio/ script/ assembly/
```

---

## 6. failTags 标准字典

所有 QA 审核输出的标签必须来自 `lib/qa-tags.ts`，保证以下模块消费口径一致：

- `ConsistencyReport`：仅统计 `isConsistencyTag: true` 的标签
- `ProviderBenchmark`：按 failTags 分类分析 provider 表现
- `Dashboard`：废片率统计以 `verdict=fail` 为准

### 角色一致性相关标签

| code | 含义 |
|---|---|
| `face-inconsistency` | 面部不一致 |
| `wardrobe-drift` | 服装漂移 |
| `hairstyle-change` | 发型变化 |
| `body-proportion` | 体型比例异常 |
| `extra-limb` | 多余肢体 |
| `missing-limb` | 肢体缺失 |
| `temporal-inconsistency` | 帧间不一致（视频）|

---

## 7. 服务端启动恢复

`instrumentation.ts` 在 Next.js 服务端启动时执行，Node.js 专属逻辑在 `instrumentation.node.ts`：

1. `running/retrying` 任务 → 标记 `failed`（进程中断，无法从断点续执行）
2. `queued` 且超过 `maxAttempts` 的任务 → 标记 `failed`
3. `queued` 且未超次数的任务 → **服务器启动 2 秒后自动恢复执行**
   - 按任务类型分发到对应 workflow：image / video / audio / sfx / assembly
   - 恢复前检查目标是否已有 adopted take；若目标已达成则跳过（标记 `completed`）
   - `script-breakdown` 无法自动重建输入参数，标记 `failed` 并给出说明
   - 使用现有 `taskId` 调用 `runTask`（不创建新任务），日志写入原任务记录
   - 限速 200ms / 任务，避免一次性淹没 pQueue
