# AI Director Studio — 本地 AI 影视制作工作台

> **版本**：v1.0（2026 Architecture）  
> **愿景**：面向开发者与创作者的本地全栈 AI 短剧/漫剧工作台。采用「前端即桌面软件」思路，借助 SOTA 大模型集群，形成高连贯、高画质的本地化影视流水线。

---

## 目录

1. [技术栈总览](#1-技术栈总览)
2. [环境准备与安装](#2-环境准备与安装)
3. [核心工作流：六步成片法](#3-核心工作流六步成片法)
4. [数据库设计（Prisma）](#4-数据库设计prisma)
5. [架构设计图与核心代码片段](#5-架构设计图与核心代码片段)
6. [大模型动态切换适配器](#6-大模型动态切换适配器)
7. [避坑指南与最佳实践](#7-避坑指南与最佳实践)

---

## 1. 技术栈总览

项目弱化传统后端，采用 **Node.js + 前端技术栈** 直接调度本地硬件与任务。


| 类别     | 选型                                  |
| ------ | ----------------------------------- |
| 框架核心   | Next.js（App Router）+ React          |
| 包管理    | pnpm                                |
| 样式与 UI | Tailwind CSS + Shadcn/ui            |
| 状态管理   | Zustand                             |
| 本地数据库  | SQLite + Prisma ORM                 |
| 任务并发   | `p-queue`（限流 / 队列）                  |
| 媒体处理   | FFmpeg（系统安装）+ `fluent-ffmpeg`（Node） |


---

## 2. 环境准备与安装

### 2.1 系统级依赖（最易遗漏）

视频合成依赖本机 FFmpeg，请在 **Windows / macOS** 上安装并让 `ffmpeg` 在 PATH 中可用。

- **macOS**：`brew install ffmpeg`
- **Windows**：`scoop install ffmpeg`，或官网安装后将 `bin` 加入 PATH
- **验证**：终端执行 `ffmpeg -version`，能输出版本即成功

### 2.2 初始化项目与依赖

```bash
# 1. 创建 Next.js 项目（建议开启 App Router 与 TypeScript）
pnpm create next-app@latest ai-director-studio
cd ai-director-studio

# 2. 安装核心依赖
pnpm add zustand axios p-queue fluent-ffmpeg
pnpm add -D prisma @types/fluent-ffmpeg
pnpm add @prisma/client

# 3. 初始化 Shadcn UI
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input textarea progress slider select toast

# 4. 初始化本地数据库
npx prisma init --datasource-provider sqlite
```

### 2.3 环境变量 `.env.local`

在项目根目录创建 `.env.local`，按需配置模型与密钥（以下为示例占位）：

```env
# 数据库
DATABASE_URL="file:./dev.db"

# 1. 剧本大脑（推荐：DeepSeek-v4-Pro / GLM-5.1）
DEEPSEEK_API_KEY="sk-xxxx"

# 2. 视觉资产（推荐：字节即梦 Seedream）
SEEDREAM_API_KEY="sk-xxxx"

# 3. 动态引擎（推荐：海螺 02 / 可灵 1.5）
VIDEO_API_KEY="sk-xxxx"

# 4. 声音设计（推荐：MiniMax Speech / 阿里 Qwen3）
TTS_API_KEY="sk-xxxx"
```

---

## 3. 核心工作流：六步成片法

为减轻「人设崩」「剧情不接」等问题，前端建议采用 **分步向导（Wizard）**：每一步可校验再继续。

1. **世界观与角色卡（Lore & Cast）**：定主线；用 AI 产出角色参考图并存本地，作为后续垫图 / 一致性锚点。
2. **剧本拆解（Script → Scenes）**：用大模型把单集剧本拆成约 10–20 张分镜卡片（如 JSON）；支持人工改提示词。
3. **首帧抽卡（Keyframe）**：按分镜并发生成首帧；支持单镜重抽到满意为止。
4. **视频与配音（Animate & Voicify）**：图生视频（I2V）与 TTS 可并发执行；用 `p-queue` 将并发限制在 **2–3**，降低限流封号风险。
5. **本地时间线合成（Timeline Assembly）**：Node 调用本机 FFmpeg，读写本地音视频；按脚本对齐时长（如视频短时尾帧定格/慢放，音频短时截视频等），输出 MP4。
6. **续集传承（Next Episode）**：新一集生成时读取上一集的摘要与角色设定，再走模型以保持连贯记忆。

---

## 4. 数据库设计（Prisma）

将下列内容写入 `prisma/schema.prisma` 后执行：

```bash
npx prisma db push
```

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Project {
  id          String      @id @default(uuid())
  title       String
  globalLore  String // 世界大纲
  createdAt   DateTime    @default(now())
  characters  Character[]
  episodes    Episode[]
}

model Character {
  id          String  @id @default(uuid())
  projectId   String
  name        String
  prompt      String // 描述提示词
  refImageUrl String // 本地定妆照相对路径（如 /workspace/chars/1.png）
  project     Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Episode {
  id         String  @id @default(uuid())
  projectId  String
  episodeNum Int
  summary    String // 本集摘要（用于生成下一集）
  status     String  @default("draft") // draft, generating, completed
  scenes     Scene[]
  project    Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Scene {
  id           String @id @default(uuid())
  episodeId    String
  sceneOrder   Int // 第几个镜头
  visualPrompt String // 画面提示词
  dialogue     String // 台词
  audioPrompt  String // 情绪，如 [哭腔]

  localImage String?
  localVideo String?
  localAudio String?

  status  String  @default("pending") // pending, image_done, video_done, error
  episode Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
}
```

---

## 5. 架构设计图与核心代码片段

### 5.1 目录结构规划

```text
/
├── app/                          # Next.js 页面与 API 路由
│   ├── api/
│   │   ├── task/status/route.ts  # SSE 任务进度
│   │   └── generate/…            # 触发大模型相关路由
│   └── page.tsx                  # 工作台主界面
├── lib/
│   ├── models/                   # AI 提供商适配层
│   ├── ffmpeg.ts                 # FFmpeg 封装
│   └── utils.ts
├── public/
│   └── workspace/                # 图片、音视频等产物（可直链）
└── prisma/
```

### 5.2 Server-Sent Events（SSE）替代 WebSocket

长耗时任务（数分钟级）优先考虑 **SSE** 推送进度。

`**app/api/task/status/route.ts` 示例：**

```ts
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId');

  const stream = new ReadableStream({
    start(controller) {
      const timer = setInterval(() => {
        const mockProgress = Math.floor(Math.random() * 100);

        controller.enqueue(
          `data: ${JSON.stringify({ taskId, progress: mockProgress })}\n\n`,
        );

        if (mockProgress >= 95) {
          clearInterval(timer);
          controller.enqueue(`data: ${JSON.stringify({ status: 'DONE' })}\n\n`);
          controller.close();
        }
      }, 2000);

      req.signal.addEventListener('abort', () => {
        clearInterval(timer);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

**浏览器端：**

```ts
const evtSource = new EventSource('/api/task/status?taskId=123');
evtSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('当前进度:', data.progress);
};
```

### 5.3 资源落盘（`public/workspace`）

生成的图片 / 视频建议落在 `public/workspace/`，前端可直接 `src="/workspace/xxx.mp4"` 引用。

```ts
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export async function downloadAssetToLocal(url: string, filename: string) {
  const destDir = path.join(process.cwd(), 'public', 'workspace');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const destPath = path.join(destDir, filename);
  const response = await axios({ url, responseType: 'stream' });

  return new Promise<string>((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on('finish', () => resolve(`/workspace/${filename}`));
    writer.on('error', reject);
  });
}
```

---

## 6. 大模型动态切换适配器

业务代码不要绑定单一厂商 API；用 **适配器模式** 切换实现。

`**lib/models/video.ts` 示意：**

```ts
interface VideoProvider {
  generateI2V(imageUrl: string, prompt: string): Promise<string>;
}

class KlingAdapter implements VideoProvider {
  async generateI2V(imageUrl: string, prompt: string) {
    // 调用可灵 API …
    return 'kling_video_url';
  }
}

class HailuoAdapter implements VideoProvider {
  async generateI2V(imageUrl: string, prompt: string) {
    // 调用海螺 API …
    return 'hailuo_video_url';
  }
}

export class VideoGenerator {
  static getProvider(name: 'kling' | 'hailuo'): VideoProvider {
    if (name === 'kling') return new KlingAdapter();
    if (name === 'hailuo') return new HailuoAdapter();
    throw new Error('Unknown provider');
  }
}

// const provider = VideoGenerator.getProvider('hailuo');
// const url = await provider.generateI2V(localImgUrl, '角色奔跑');
```

---

## 7. 避坑指南与最佳实践

- **API 超时**：Next.js Route 在某些部署环境下默认超时偏短；**图生视频**宜走「提交任务拿到 ID → 前端通过 SSE / 轮询查状态」的异步链路，不要把一次请求卡住整条 HTTP。
- **并发与限流**：如果你一集有 20 个分镜，不要用 Promise.all 一次性发 20 个请求！你会立刻被厂商封禁。引入 p-queue，配置 concurrency: 2，让它们排队慢慢生。
- **缓存与成本控制**：调试期可对相同 Prompt 做本地缓存（例如按内容 MD5 映射结果），避免重复扣费。
- **分辨率与画幅**：建议全局统一纵横比（如 **16:9**，1280×720 或 1920×1080）；**图像与视频输入宽高比应尽量一致**，减少 I2V 扭曲或失败。

