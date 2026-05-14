# 🚀 Feature Specification: 动态角色发现与拦截机制 (Dynamic Character Interception)

## 1. 业务背景与目标 (Context & Goal)
在 AI 短剧工业流中，用户通常在第一步建立核心角色资产（定妆照），随后按集拆解剧本。
**痛点**：在后续剧集（如第3集）的剧本中，往往会“空降”新的重要角色。如果强制要求用户回退到第一步建立角色，体验极差。
**目标**：开发一套“动态嗅探与拦截机制”。在调用大模型拆解单集剧本时，自动比对本地数据库中的已有角色库。一旦发现新角色，**拦截流程 -> 唤起前端弹窗要求补齐角色资产 -> 补齐后无缝恢复分镜生成**。

---

## 2. 核心工作流 (Workflow)

请 AI 编程助手严格按照以下 4 个步骤帮我实现逻辑：

### Step 1: 大模型 Prompt 注入 (剧本解析阶段)
在向 DeepSeek (文本大模型) 发送剧本进行分镜拆解时，需将当前数据库中该项目已有的角色列表作为 Context 传给大模型，并修改 System Prompt，要求其分离出“重要的新角色”。

**👉 提供给 DeepSeek 的 System Prompt 示例要求：**
> 你是一个专业的分镜师。请阅读剧本并拆解为分镜列表 (scenes)。
> 【当前已有角色库】：${existingCharacters.map(c => c.name).join(', ')}
> 【任务指令】：
> 1. 拆解分镜。
> 2. 如果剧本中出现了**不在已有角色库中的“新重要角色”**，请在 `newCharacters` 数组中提取他们的名字和外貌描述。
> 3. 注意：路人甲、保安、群众演员等非关键 NPC 绝对不要放入 `newCharacters`，只需在画面提示词中泛化描述即可。

**👉 期望的 JSON Schema 返回格式：**
```typescript
interface DeepSeekResponse {
  newCharacters: Array<{
    name: string;
    description: string; // 外貌与性格特征，用于后续生成定妆照
  }>;
  scenes: Array<{
    sceneOrder: number;
    visualPrompt: string;
    dialogue: string;
    audioPrompt: string;
  }>;
}
```

Step 2: Next.js 后端 API 拦截逻辑 (/api/script/parse)
接收前端传来的单集剧本（Script），调用 DeepSeek 接口，并在拿到结果后进行状态拦截。
👉 后端算法逻辑：
获取 projectId 下所有现存的 Character 数据。
调用 DeepSeek 解析剧本，获取 JSON。
判断拦截：如果 response.newCharacters.length > 0：
暂不将 scenes 存入数据库。
返回 HTTP 200，且 payload 为：{ status: "NEED_CHARACTER_SETUP", data: { newCharacters, pendingScenes: response.scenes } }
放行：如果 newCharacters 为空：
直接将 scenes 存入 SQLite (Prisma)。
返回 HTTP 200，且 payload 为：{ status: "SUCCESS" }
Step 3: 前端状态机与 UI 交互 (React + Zustand)
前端在请求解析剧本的接口后，需要处理 NEED_CHARACTER_SETUP 状态。
👉 交互逻辑要求：
监听到拦截状态后，不要跳转页面，而是在当前分镜列表页上方弹出一个 阻断式弹窗 (Modal / Drawer)。
弹窗提示：“检测到新角色入场，请先为他们建立视觉资产！”
弹窗内渲染 newCharacters 列表。用户可逐一点击【生成定妆照】（调用现有的图生图/文生图 API 生成图片并保存至本地 public/workspace/...）。
新角色的图片确认满意后，调用前端接口 POST /api/characters/create 写入数据库，与当前 Project 绑定。
Step 4: 释放拦截与流程恢复 (Resume Pipeline)
👉 逻辑要求：
当弹窗内所有新角色的资产全部创建完毕并入库后：
弹窗关闭。
前端携带之前暂存的 pendingScenes 列表，调用 POST /api/scenes/batch-create 接口。
后端将分镜真正落库，流程无缝恢复到“首帧抽卡”阶段。
3. Prisma 数据库参考上下文
AI 助手请参考以下已有的 Schema 模型（无需修改，只需知道表关联关系即可）：
code
Prisma
model Project {
  id          String      @id @default(uuid())
  characters  Character[] // 一对多：项目下的所有角色资产
  episodes    Episode[]
}

model Character {
  id          String  @id @default(uuid())
  projectId   String
  name        String
  prompt      String
  refImageUrl String  // 本地图片路径
  project     Project @relation(fields: [projectId], references: [id])
}

model Scene {
  id           String  @id @default(uuid())
  episodeId    String
  // ... 其他分镜字段
}
