# 🎬 AI Director Studio — 商业级本地 AI 影视生产引擎

> **版本**：v2.0（2026 Profit-Driven Architecture）  
> **定位**：这不是一个普通的开源玩具，而是一台为创作者量身定制的**“超一流 AI 视听内容印钞机”**。
> **愿景**：通过前端视角的 Node.js 全栈架构，结合 SOTA 大模型集群与独创的「AI 自我纠错机制」，实现高连贯、零崩坏、情绪拉满的工业级短剧/漫剧批量生产，服务于全网多平台内容分发与流量变现。

---

## 📑 目录

1. [核心变现优势策略 (The Edge)](#1-核心变现优势策略-the-edge)
2. [技术栈总览](#2-技术栈总览)
3. [核心工作流：工业级六步成片法](#3-核心工作流工业级六步成片法)
4. [环境准备与安装](#4-环境准备与安装)
5. [数据库设计（Prisma Schema）](#5-数据库设计prisma-schema)
6. [架构设计与避坑指南](#6-架构设计与避坑指南)

---

## 1. 核心变现优势策略 (The Edge)

为了在极度内卷的短剧市场中杀出重围，本系统在底层设计上强制植入了四大商业级优势：

- 🛡️ **视觉质检 Agent (零废片机制)**：视频生成后，自动调用多模态大模型进行“抽帧审阅”。一旦发现肢体崩坏或脸部扭曲，系统静默抛弃并重试，确保你拿到的素材 100% 可直接商用。
- 🎭 **数字演员 IP 库 (绝对一致性)**：采用“先大纲 -> 定角色 -> 再分镜”逻辑。将角色的定妆照作为全局锚点（Reference/FaceID），死死锁住人脸，打造高粉丝黏性的专属数字演员。
- 🎛️ **好莱坞级声效引擎 (多轨混音)**：告别干瘪的机器朗读。系统自动解析画面情绪，生成：[带有哭腔/呼吸声的台词] + [破碎/打斗的环境音效(SFX)] + [智能压限处理的BGM]，极致拉升前 3 秒完播率。
- 🐙 **一鱼多吃分发矩阵 (ROI 最大化)**：一次生成，多模态导出。不仅输出 9:16 的抖音短剧，还可一键将高清图片拼接成带有对话气泡的“长条图文漫剧”，通吃小红书图文流量。

---

## 2. 技术栈总览

完全摒弃繁重的后端语言，采用 **Node.js + 前端技术栈** 直接掌控本地硬件与文件系统，没有跨域限制，没有昂贵的云存储费用。

| 模块 | 技术选型 | 商业化优势 |
| --- | --- | --- |
| **框架核心** | Next.js (App Router) + React | 前后端同源，无缝调度本地文件，极速开发 |
| **状态/UI** | Zustand + Tailwind + Shadcn/ui | 构建类似“剪映”般丝滑的桌面级编辑器交互 |
| **本地数据库** | SQLite + Prisma ORM | 0 配置，直接把数据存在项目目录，绝对隐私 |
| **并发/流控** | `p-queue` + SSE (Server-Sent Events) | 完美防范商业大模型 API 限流，实时推流进度 |
| **后期合成** | 本机 FFmpeg + `fluent-ffmpeg` | 免费、极速的多轨混音与自动裁剪工具 |

---

## 3. 核心工作流：工业级六步成片法

**逻辑顺序极度关键：先定世界观与脸，再写详细剧本，最后生成流。**

### Step 1: 世界观与数字演员库建立 (Lore & IP Cast)
- **动作**：输入本剧的总体大纲（如：豪门复仇）。
- **资产锁定**：调用 FLUX.2 Max 或即梦，针对大纲中的主角生成 3-4 张不同角度的极品画质定妆照。这些照片将作为**绝对资产**存入本地数据库，用于后续所有画面的“垫图绑定”。

### Step 2: 单集分镜剧本拆解 (Script → Scenes)
- **动作**：将“大纲 + 本集细纲”喂给 DeepSeek V4 Pro，大模型将其拆解为 10-20 个颗粒度极细的 JSON 分镜卡片。
- **关联**：剧本提示词中会自动注入 Step 1 中绑定的角色 Tag，明确标注当前镜头需要调用哪位数字演员。

### Step 3: 首帧抽卡与人脸强绑定 (Keyframe Gacha)
- **动作**：按分镜列表并发调用图像 API，并在请求参数中强植入角色的 Reference Image。
- **确认**：UI 呈现瀑布流，用户可以针对某张不完美的构图单卡点击“重绘”，直到满意为止。

### Step 4: 动态引擎与三轨音频激活 (Animate & Audio)
- **动作**：确认首帧后，图生视频 (I2V) 与 TTS 开始排队并发执行。
- **🔥 质检介入 (QA)**：视频返回后，后台静默截取视频中间帧，传给大模型问：“手指正常吗？”正常则通过，异常则后台自动重新生成视频。
- **多轨生成**：同时调用语音模型生成带情绪（如 [咆哮]）的配音，以及音效模型生成对应动作的环境音。

### Step 5: 后期自动对齐与多态导出 (Timeline & Export)
- **动作**：Node.js 调度本地 FFmpeg 将所有资产拼合。
- **智能对齐**：视频如果比音频短，FFmpeg 自动对视频最后一帧做“定格延长(Freeze-frame)”处理，确保口型/剧情不跳跃。有人声说话时自动压低 BGM 轨道。
- **多端输出**：不仅输出 16:9 或 9:16 的 MP4，同时支持导出 HTML Canvas 拼接的“漫画风格长图”用于小红书分发。

### Step 6: 续集传承机制 (Next Episode Memory)
- **动作**：开启第二集时，系统自动提取《第一集剧情摘要》与《角色档案库》，作为 System Prompt 喂给大模型，确保跨集的剧情连贯性与人物样貌 100% 统一。

---

## 4. 环境准备与安装

由于涉及本地音视频合成，**本机的 FFmpeg 环境是重中之重。**

### 4.1 安装系统底层依赖
- **macOS**: `brew install ffmpeg`
- **Windows**: 使用 `scoop install ffmpeg`，或官网下载压缩包将 `/bin` 路径配置入系统环境变量 `PATH`。

### 4.2 搭建 Next.js 工程
```bash
# 1. 初始化项目与核心依赖
pnpm create next-app@latest ai-director-studio
cd ai-director-studio
pnpm add zustand axios p-queue fluent-ffmpeg
pnpm add -D prisma @types/fluent-ffmpeg
pnpm add @prisma/client

# 2. 注入 Shadcn UI 基础组件
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input textarea progress slider toast

# 3. 初始化本地 SQLite
npx prisma init --datasource-provider sqlite

```
### 4.3 核心环境变量 .env.local

DATABASE_URL="file:./workspace/database.db"

# 模型矩阵推荐 (2026 最新最优解)
# 大脑: 剧本与分镜逻辑调度
DEEPSEEK_API_KEY="sk-xxxx" 
TEXT_MODEL="deepseek-v4-pro"

# 美术: 图片生成与角色绑定
SEEDREAM_API_KEY="sk-xxxx"
IMAGE_MODEL="seedream-v5.0"

# 摄影: 图生视频与物理引擎
VIDEO_API_KEY="sk-xxxx"
VIDEO_MODEL="hailuo-02"

# 声音: 台词情绪与环境音效
TTS_API_KEY="sk-xxxx"
TTS_MODEL="minimax-speech-01"

## 5. 数据库设计（Prisma Schema）

将以下 Schema 写入 prisma/schema.prisma 并运行 npx prisma db push。
这套表结构完美支撑了**“IP资产复用”和“多集连贯”**的商业化需求。

generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// 剧集 IP 宇宙
model Project {
  id          String      @id @default(uuid())
  title       String
  globalLore  String      // 核心世界大纲
  createdAt   DateTime    @default(now())
  characters  Character[] // 绑定的数字演员资产
  episodes    Episode[]
}

// 🌟 数字演员表（保障一致性的核心）
model Character {
  id          String  @id @default(uuid())
  projectId   String
  name        String
  prompt      String  // 核心外貌提示词
  refImageUrl String  // 存储在本地的定妆照URL (如 /workspace/chars/1.png)
  project     Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Episode {
  id         String  @id @default(uuid())
  projectId  String
  episodeNum Int
  summary    String  // 喂给下一集的剧情摘要
  status     String  @default("draft") 
  scenes     Scene[]
  project    Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

// 颗粒度最细的单分镜镜头
model Scene {
  id           String @id @default(uuid())
  episodeId    String
  sceneOrder   Int
  
  // 提示词资产
  visualPrompt String // 送给画图模型的提示词 (包含角色描述)
  dialogue     String // 送给TTS的台词
  audioPrompt  String // 情绪与环境音 (如: [冷笑] [雨声])

  // 本地媒体资产落地路径
  localImage String?  
  localVideo String?
  localAudio String?

  status  String  @default("pending") // 包含 qa_failed, video_done 等状态
  episode Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
}

## 6. 架构设计与避坑指南

6.1 本地资源强管理机制
不要将大模型生成的 URL 直接存入数据库（这类 URL 通常会过期）。务必在 Next.js 后端下载文件至根目录的 public/workspace/ 下，前端直接使用相对路径 <video src="/workspace/episode1/scene1.mp4" /> 渲染，彻底实现离线可用与数据隐私。
6.2 SSE 防阻断长链接推送
短剧生成包含漫长的队列等待与渲染。放弃 WebSocket，全面采用 Server-Sent Events (SSE)：前端建立 EventSource，后端通过 ReadableStream 实时回传 progress: 80%，确保 Next.js 在漫长的大模型生成等待期内绝不断开请求。
6.3 并发限流策略（省钱与防封禁）
引入 p-queue 将请求并发锁死在 concurrency: 2 或 3。
不要用 Promise.all 一次性砸入 20 个镜头给 API，极易触发各家大模型平台的 429 Too Many Requests，导致任务链全面崩溃。稳扎稳打，让机器彻夜排队干活才是工业化的常态。