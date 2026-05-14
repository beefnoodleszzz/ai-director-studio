# AI Director Studio

> 本地全栈 AI 影视制作工作台 · v0.1.0

面向开发者与创作者的本地 AI 短剧/漫剧生产线。采用「前端即桌面软件」思路，借助 SOTA 大模型集群，形成高连贯、高画质的本地化影视流水线。

---

## 功能特性

- **六步成片向导**：世界观设定 → 剧本拆解 → 首帧生成 → 视频&配音 → FFmpeg 合成 → 续集传承
- **多模型适配器**：DeepSeek（剧本）、字节即梦 Seedream（图像）、可灵/海螺（视频）、MiniMax（TTS）
- **p-queue 限流**：并发数 ≤ 2，防止 API 封号
- **本地 SQLite**：Prisma ORM，零服务端依赖，数据完全本地
- **SSE 实时进度**：长任务异步轮询，不阻塞 HTTP
- **暗色影院主题**：基于 Shadcn/ui nova + Tailwind CSS v4

---

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | Next.js 15 App Router + TypeScript |
| 包管理 | pnpm |
| UI | Tailwind CSS v4 + Shadcn/ui |
| 状态 | Zustand |
| 数据库 | SQLite + Prisma ORM 7 |
| 任务队列 | p-queue（并发 2） |
| 媒体处理 | FFmpeg + fluent-ffmpeg |

---

## 环境准备

### 1. 系统依赖

需在本机安装 FFmpeg 并确保 PATH 中可用：

```bash
# macOS
brew install ffmpeg

# Windows
scoop install ffmpeg

# 验证
ffmpeg -version
```

### 2. Node.js / pnpm

- Node.js >= 18
- pnpm >= 8

```bash
npm install -g pnpm
```

---

## 安装与启动

```bash
# 1. 克隆项目
git clone https://github.com/beefnoodleszzz/ai-director-studio.git
cd ai-director-studio

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入你的 API Keys

# 4. 初始化数据库
npx prisma db push

# 5. 启动开发服务器
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)

---

## 环境变量说明

复制 `.env.local.example` 为 `.env.local` 后编辑：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | SQLite 路径，默认 `file:./dev.db` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（剧本拆解） |
| `DEEPSEEK_MODEL` | 模型名，默认 `deepseek-chat` |
| `SEEDREAM_API_KEY` | 字节即梦密钥（首帧生成） |
| `KLING_API_KEY` | 可灵密钥（图生视频） |
| `HAILUO_API_KEY` | 海螺密钥（图生视频备选） |
| `VIDEO_PROVIDER` | 视频提供商：`kling` 或 `hailuo` |
| `TTS_API_KEY` | MiniMax 密钥（TTS 配音） |
| `GENERATION_CONCURRENCY` | 并发数，默认 `2` |

---

## 使用指南

### 六步成片流程

1. **世界观 & 角色**：新建项目，填写世界大纲，添加角色卡（名称+提示词+定妆照 URL）
2. **剧本拆解**：创建第一集，粘贴剧本（500~2000字），AI 自动拆解为 10~20 个分镜
3. **首帧抽卡**：批量生成各分镜首帧图，可单张重抽
4. **视频 & 配音**：并发生成 I2V 视频 + TTS 配音
5. **时间线合成**：FFmpeg 拼接所有分镜输出 MP4
6. **续集传承**：AI 生成下一集剧情种子，保持人设连贯

### 注意事项

- 一集 20 个分镜请勿一次性全发，`p-queue` 默认限流为 **并发 2**
- 图生视频属于异步长任务（数分钟），可在「视频 & 配音」步骤通过 SSE 轮询进度
- 生成产物落盘于 `public/workspace/`，可直接通过 `/workspace/xxx.mp4` URL 访问

---

## 项目结构

```
├── app/
│   ├── api/                    # API 路由
│   │   ├── task/status/        # SSE 进度推送
│   │   ├── generate/           # 各类生成接口
│   │   └── projects/           # 项目 CRUD
│   └── (studio)/               # 工作台页面
├── components/studio/          # 核心业务组件
├── lib/
│   ├── models/                 # AI 模型适配器
│   ├── ffmpeg.ts               # FFmpeg 封装
│   ├── queue.ts                # p-queue 限流
│   └── asset.ts                # 资源落盘
├── stores/                     # Zustand 状态
├── prisma/schema.prisma        # 数据库模型
└── public/workspace/           # 生成产物目录
```

---

## License

MIT
