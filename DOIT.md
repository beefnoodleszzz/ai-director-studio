# AI Director Studio 最终未完成事项

本文件只保留**还必须继续做**的内容。

当前项目已经完成了绝大多数收尾项，包括：

- `pnpm lint` 通过
- `pnpm build` 通过
- `discard` 持久化
- `accept-minor` 持久化
- QA 单项 / 批量重做闭环
- CharacterBible 新建字段补全
- Benchmark / Dashboard / Consistency / Template Stats / 双模态导出等功能落地

现在距离“全部完成”还差最后一块核心能力和一组最终验证。

---

## 1. 任务恢复必须升级为真实恢复执行

### 现状

[instrumentation.ts](/Users/zhangxiaolong/Desktop/ai-director-studio/instrumentation.ts) 当前做的是：

- `running / retrying` 任务在应用重启后被标记为 `failed`
- `queued` 任务被保留并追加日志
- 任务中心能看到“待恢复”状态

这已经实现了：

- 状态不丢
- 中断原因可见
- 用户可以手动重试

但这**还不等于真正完成**。

### 为什么还没完成

当前实现仍然不满足“真实恢复执行”这条最终标准。

差距在于：

- 重启后 `queued` 任务不会自动继续执行
- 系统只是把任务保留在数据库里
- 后续仍依赖用户再次进入页面或手动触发

也就是说，现在是：

- `状态恢复`

不是：

- `执行恢复`

### 必须完成的内容

1. 为 `queued` 任务建立真正的自动恢复执行机制
2. 恢复逻辑必须按任务类型分发
   - `image`
   - `video`
   - `audio`
   - `sfx`
   - `assembly`
   - `script-breakdown`
3. 恢复时必须避免重复执行
   - 已完成任务不能重复跑
   - 已生成并 adopted 的结果不能重复覆盖
4. 恢复时必须处理最大重试次数
5. 恢复过程必须写任务日志
6. 恢复失败必须留下明确错误原因

### 实现要求

- 自动恢复逻辑必须在服务端启动后真实触发
- 不接受“仅记录日志，等待用户下次访问时再执行”的方案
- 不接受“文档改口说这就是恢复”的方案

### 验收标准

以下场景必须真实通过：

1. 创建一个 `queued` 的图片生成任务
2. 在任务真正执行前关闭应用
3. 重启应用
4. 任务自动继续执行
5. 最终任务进入 `completed` 或明确 `failed`
6. 全程无需人工点击重试按钮

还必须验证：

- 连续重启不会造成同一任务重复生成多个结果
- 超过 `maxAttempts` 的任务会稳定停下
- 恢复任务的日志可在任务中心看到

---

## 2. 文档必须和最终实现完全一致

当任务恢复真正完成后，需要做最后一轮文档对齐。

### 必须检查的文件

- [README.md](/Users/zhangxiaolong/Desktop/ai-director-studio/README.md)
- [docs/architecture.md](/Users/zhangxiaolong/Desktop/ai-director-studio/docs/architecture.md)
- [docs/local-first-world-class-todolist.md](/Users/zhangxiaolong/Desktop/ai-director-studio/docs/local-first-world-class-todolist.md)

### 必须完成的内容

1. 确保文档中的“任务恢复”描述和最终代码行为完全一致
2. 确保没有任何“代码里其实没做到”的已完成描述
3. 确保双模态导出、QA、任务系统、模板统计等能力的描述都是真实的
4. 删除所有过时描述

### 验收标准

- 文档不夸大
- 文档不落后
- 文档不含冲突描述

---

## 3. 最终回归验证

在宣布“全部完成”前，必须做一次完整回归。

### 3.1 工程验证

- `pnpm lint`
- `pnpm build`

### 3.2 任务恢复验证

- `queued` 任务自动恢复执行
- `running / retrying` 中断后处理符合设计
- 恢复后无重复生成

### 3.3 核心工作流验证

1. 新建项目
2. 创建角色圣经
3. 创建风格圣经
4. 剧本拆解为 `scene / shot`
5. 生成多候选 image take
6. adopt / discard
7. 视频生成
8. QA 接受瑕疵 / 重做
9. 短剧导出
10. 漫剧导出

### 3.4 文档验证

- README 与实际一致
- architecture 与实际一致
- 总纲与实际一致

---

## 4. 完成判定

只有同时满足以下条件，才可以删除本文件中的所有条目，并认定项目“全部完成”：

1. `queued` 任务在应用重启后能够真实自动恢复执行
2. 恢复过程不会造成重复生成或无限重试
3. 任务日志与状态可追踪
4. 所有文档与最终实现完全一致
5. 完成一轮全链路回归验证且结果正常

---

## 5. 当前结论

当前项目**只差最后一块：真实任务恢复执行 + 最终文档校准 + 一轮回归验证**。

这三项完成后，才能真正宣布：

- A 完成
- B 完成
- C 完成
- D 完成
- 项目全部完成
