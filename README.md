# AI Director Studio

本地单机运行的 AI 短剧 / 漫剧生产工具。

---

## 已实现能力

### 阶段 A — 可控生产骨架

- **项目管理**：新建项目、选择类型（短剧/漫剧）、设置世界观与禁改规则
- **风格圣经**：颜色风格、镜头语言、参考关键词持久化管理
- **角色圣经**：完整角色档案（外观锚点、服装变体、声音档案、人际关系）
- **角色资产上传**：多张参考图（定妆照/多角度/表情/服装变体）网格展示与管理
- **剧本拆解**：AI 将剧本拆解为场次（Scene）+ 镜头（Shot）结构，支持发现新角色时中断确认
- **持久化任务系统**：基于 SQLite 的 `GenerationTask` 表，重启后状态不丢；启动时清理中断任务（`running/retrying` → `failed`），`queued` 任务在服务器启动 2 秒后**自动恢复执行**（image / video / audio / sfx / assembly），已有 adopted take 则跳过，超出 `maxAttempts` 标记 failed

### 阶段 B — 导演工作台

- **镜头工作台**：每个镜头支持生成多个图像 Take，视图可切换（列表/时间线）
- **Take 管理**：手动采用（adopt）、废弃（discard，持久化），多 Take 对比查看
- **时间线视图**：横向时间轴显示镜头序号与审核状态，支持拖拽排序（持久化到 DB）
- **批量生成**：按场次批量生成图片候选，支持仅重做失败镜头
- **QA 面板**：按 verdict（通过/警告/失败）和 failTags 标签筛选，接受瑕疵持久化，批量重做
- **任务中心**：生成任务状态追踪，失败/取消任务支持手动重试（重新入队）

### 阶段 C — 质量飞轮

- **Prompt 模板库**：结构化模板（风格前缀/角色锚点/动作/情绪/质量后缀），全局模板库支持跨项目克隆
- **模板统计**：统计每个模板关联的通过率/废片率/平均重试次数
- **Provider 基准**：按 provider 和 take 类型统计通过率、均分、耗时
- **Provider 自动推荐**：基于历史数据推荐最优 provider，接入镜头工作台默认选项
- **一致性报告**：基于标准 failTags 字典，统计每个角色跨集稳定性
- **生产指标看板**：废片率/可用率/镜头进度/任务统计，快捷跳转到 QA/任务中心/一致性报告
- **句级对白修正**：对白按句分割，支持行级编辑
- **场次情绪曲线**：可视化折线图 + 预设快捷选择，持久化到 Scene.emotionArc

### 阶段 D — 双模态产线

- **短剧导出**：基于采用 Take 组装 MP4，支持 16:9 / 9:16
- **漫剧导出**：多种网格模板（单格/双格/三格/动态五格等），气泡系统支持对白/旁白/拟声字/章节标题四种 SVG 样式
- **导出历史**：manifest 追溯（episode/scene/shot/take 链路），支持内联展开查看

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 App Router |
| 数据库 | SQLite + Prisma |
| UI | Tailwind CSS v4 + shadcn/ui |
| 状态 | Zustand |
| 媒体处理 | FFmpeg (视频组装) + Sharp (漫剧导出) |
| AI 生成 | 可扩展 Provider 适配层 |

## 本地运行

```bash
pnpm install
pnpm prisma db push
pnpm dev
```

访问 http://localhost:3000

---

## 目录结构

```
app/
  (studio)/projects/[id]/    # 项目工作台页面
  api/                       # API 路由
components/studio/           # 导演工作台 UI 组件
lib/
  workflows/                 # 生成工作流（image/video/audio/assembly）
  manga/                     # 漫剧排版引擎（templates/layout/export）
  qa-tags.ts                 # 标准 QA failTags 字典
  task-queue.ts              # 持久化任务队列
  provider-recommender.ts    # Provider 推荐算法
prisma/schema.prisma         # 数据模型
```
