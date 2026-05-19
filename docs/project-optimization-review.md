# AI Director Studio 项目优化执行版

更新时间：2026-05-19  
目标：把当前项目推进为一台更可靠的本地 AI 短剧制作机器  
范围：任务系统、安全边界、数据契约、Next.js 架构、工程质量

---

## 1. 总体判断

当前项目已经具备真实工作台雏形，而不是简单的模型调用 demo。

已有的核心闭环基本成立：

- 项目、角色圣经、风格圣经、剧集、场次、镜头、Take、Review、任务、导出记录这些对象已经具备
- 故事生成 → 剧本拆解 → 镜头生产 → QA → 重做 → 导出 的流程已经跑通
- 本地优先路线具备实际价值：SQLite + Prisma 管状态，文件系统保存资产，FFmpeg/Sharp 负责本地导出

下一阶段的重点不应是继续堆按钮、堆 provider、堆页面，而应先补齐以下基础能力：

1. 可靠任务执行
2. 安全的数据与资产边界
3. 稳定的数据契约和输入校验
4. 最小但关键的测试覆盖

---

## 2. 当前优势

### 2.1 产品对象建模方向正确

`Project → Episode → Scene → Shot → Take → Review` 已经接近真实制作流程。`CharacterBible`、`StyleBible`、`ExportRecord` 也让系统具备了资产沉淀能力。

### 2.2 人工导演控制已经进入主流程

Take adopt/discard、QA 接受瑕疵、批量重做、Provider Benchmark、一致性报告、导出前预检等能力，说明系统已经把用户放在导演位置，而不只是 API 调度界面。

### 2.3 本地优先路线有产线价值

对短剧创作这类需要反复打磨的流程，本地状态管理和本地资产管理是合理路线，也为后续离线、桌面化、私有化部署留下空间。

---

## 3. P0：应尽快处理

### 3.1 修复 dashboard 契约与统计错误

当前 dashboard 存在明确的前后端字段不一致问题，属于真实 bug，不是中长期优化建议。

建议：

- 统一 API 和页面使用的字段名
- 修正 provider `warnRate` 的统计口径
- 把 dashboard 响应提取为共享 contract
- 增加最小契约测试，避免再次漂移

### 3.2 把数据库和工作区移出 `public/`

当前默认数据库路径和工作区路径放在 `public/` 下，这对本地优先项目来说边界过松。

建议：

- `DATABASE_URL` 默认迁移到非公开目录，例如 `./workspace/database.db` 或 `./data/database.db`
- 将工作区拆分为两类目录：
  - 可公开预览的衍生产物
  - 非公开的数据库、任务快照、原始素材、日志
- 浏览器需要访问的媒体通过受控 route 或明确映射暴露

### 3.3 为 route handler 增加运行时校验

当前多数接口依赖 TypeScript cast 和手写存在性判断，运行时约束不足，尤其是上传和生成接口。

建议：

- 引入统一 schema 校验
- 对 `projectId/episodeId/sceneId/shotId/takeId` 做存在性与归属校验
- 上传增加 MIME、扩展名、大小、尺寸限制
- 远程下载增加来源限制，避免随意拉取未知 URL
- 统一错误响应结构，例如 `code/message/details/requestId`

### 3.4 收敛任务恢复实现

当前任务恢复逻辑存在入口和文档漂移，维护成本偏高，也容易造成误判。

建议：

- 只保留一个真实恢复入口
- queued 恢复前显式处理 `attempts >= maxAttempts`
- 明确不可恢复任务的处理方式
- 补恢复相关测试：
  - queued 自动恢复
  - running/retrying 重启后标记 failed
  - 超最大重试次数不再自动执行
  - 目标已达成时跳过恢复
- 同步修正文档说明

---

## 4. P1：下一阶段值得做

### 4.1 生成接口改为“创建任务后立即返回 taskId”

当前生成接口仍然在请求内等待任务跑完，这会拖长 HTTP 生命周期，也会让用户体验变差。

建议按渐进方式调整：

- API 只负责创建任务并返回 `taskId`
- 前端通过轮询任务状态获取进度
- 先继续沿用现有进程内队列
- 暂不急于一次性重构成独立 worker、事件流、租约机制

### 4.2 为任务系统补最小幂等与可观测性

在不做重型架构重写的前提下，仍然应该先补齐最基本的执行安全和排障能力。

建议：

- 避免同一任务被重复执行
- 记录结构化关键事件：queued、running、retry、failed、completed
- 在任务层保留 provider、耗时、错误原因等核心信息

### 4.3 增加最小测试矩阵

当前项目缺少测试体系，但第一步不需要追求“大而全”。

建议优先补：

- dashboard 契约测试
- task recovery / retry / replay 测试
- `production-state`、`retry-strategy`、`studio-contracts` 等纯函数测试
- 模型调用使用 fake provider，避免测试依赖真实 API

### 4.4 局部改为 Server-first

Next.js App Router 默认更适合 Server-first，但当前项目中很多页面本身是重交互工作台，不适合一刀切迁移。

建议：

- 先迁移 layout、dashboard、读多写少页面
- 编辑器、弹窗、拖拽、复杂工作台继续保留 client 主导
- 为主要动态路由补 `loading.tsx` 和 `error.tsx`

### 4.5 给 Prisma 增加关键索引

当前 schema 对增长后的查询压力准备不足。等任务、take、review 数量上来后，dashboard、QA、任务中心会先变慢。

建议优先考虑以下索引：

- `Episode(projectId, episodeNum)`
- `Scene(episodeId, sceneOrder)`
- `Shot(sceneId, shotOrder)`
- `Take(shotId, takeType, isAdopted, isDiscarded)`
- `Review(takeId, reviewType, reviewedAt)`
- `GenerationTask(projectId, status, createdAt)`
- `GenerationTask(shotId, taskType, status)`

---

## 5. P2：基础稳定后再做

### 5.1 关键 JSON 快照版本化

项目里大量字段以字符串形式保存 JSON，这在 0-1 阶段可接受，但后续维护成本会越来越高。

建议：

- 优先给 `inputRef/outputRef` 加 `schemaVersion`
- 再逐步覆盖 `storyOutline`、`scriptMeta` 等关键字段
- 抽出统一的 `safeParse/serialize` 工具，减少散落的 `JSON.parse`

### 5.2 增加结构化 requestId 与错误码

建议：

- 所有 route handler 带 requestId
- 错误响应包含稳定 code
- provider 调用记录 request id、模型、耗时、费用估算

### 5.3 资产管理增强

随着 Take 增多，磁盘占用和重复文件问题会更明显。

建议：

- 增加资产去重策略
- 增加清理预览清单
- 增加磁盘占用统计
- 支持项目归档导出

### 5.4 建立最小评测集

等基础链路稳定后，再建设质量飞轮会更划算。

建议：

- 先做最小 eval 集
- 固定几个题材、固定 seed、固定镜头预算
- 跟踪成功率、耗时、关键镜头视频化率、返工率、成本

---

## 6. 建议路线图

### 6.1 未来 7 天

1. 修复 dashboard 契约与 provider 统计错误
2. 将数据库与工作区迁出 `public/`
3. 给生成和上传接口补 schema 校验
4. 合并任务恢复入口并补恢复测试

### 6.2 未来 2-4 周

1. 将生成接口改为立即返回 `taskId`
2. 为任务系统补最小幂等和结构化日志
3. 建立最小测试矩阵
4. 局部迁移到 Server-first
5. 给 Prisma 增加关键索引

### 6.3 未来 1-3 个月

1. 推进关键 JSON 快照版本化
2. 增加 requestId、错误码、provider 调用记录
3. 做资产去重、清理和归档
4. 建立最小 eval 集

---

## 7. 执行原则

下一阶段不应做成“更多功能的展示台”，而应做成“更可靠的本地制作机器”。

判断一个改动是否值得做，优先看这四件事：

1. 是否减少真实 bug 或错误状态
2. 是否收紧数据库、素材、任务快照的暴露边界
3. 是否降低任务失败后的人肉排障成本
4. 是否让后续迭代更容易验证而不是更依赖手工感觉

先把这些基础打稳，再扩质量飞轮、评测体系和更重的产线能力，收益会更高。
