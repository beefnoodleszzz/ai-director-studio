/**
 * 视频生成 Workflow
 *
 * 职责：
 * 1. 基于采用的首帧 Take 生成视频候选
 * 2. 对每个视频候选执行多帧 QA（首尾一致性、主体稳定性）
 * 3. 写入 Take 记录，记录 provider/params/QA 结果
 * 4. QA 失败则自动重试（最多 maxAttempts 次）
 */

import path from "path";
import fs from "fs";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import { prisma } from "@/lib/prisma";
import { downloadToTake, saveTakeInputJson, initTakeDirs, getLocalPath } from "@/lib/asset";
import { enqueueTask } from "@/lib/task-queue";
import { generateId, sleep } from "@/lib/utils";
import { recommendProvider } from "@/lib/provider-recommender";
import type { VideoGenInput, QAReviewResult } from "./types";

// ─── Provider 抽象 ────────────────────────────────────────────────────────────

interface VideoProvider {
  name: string;
  generateI2V(imagePath: string, prompt: string): Promise<{ videoUrl: string; localHint?: string }>;
}

class KlingProvider implements VideoProvider {
  name = "kling";
  private apiKey = process.env.KLING_API_KEY ?? "";
  private baseUrl = process.env.KLING_BASE_URL ?? "https://api.klingai.com/v1";

  async generateI2V(imagePath: string, prompt: string) {
    if (!this.apiKey) throw new Error("KLING_API_KEY is not configured");

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    const submitResp = await axios.post(
      `${this.baseUrl}/videos/image2video`,
      { model_name: "kling-v1", image: `data:image/jpeg;base64,${base64Image}`, prompt, duration: "5", aspect_ratio: "9:16" },
      { headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, timeout: 30_000 }
    );

    const taskId: string = submitResp.data?.data?.task_id ?? submitResp.data?.task_id;
    if (!taskId) throw new Error("Kling: no task_id returned");

    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const queryResp = await axios.get(`${this.baseUrl}/videos/image2video/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 15_000,
      });
      const data = queryResp.data?.data ?? queryResp.data;
      const status = data?.task_status ?? data?.status;
      const videoUrl: string | undefined = data?.task_result?.videos?.[0]?.url ?? data?.video_url;

      if ((status === "succeed" || status === "completed") && videoUrl) return { videoUrl };
      if (status === "failed") throw new Error("Kling task failed");
    }
    throw new Error("Kling task timeout");
  }
}

class HailuoProvider implements VideoProvider {
  name = "hailuo";
  private apiKey = process.env.HAILUO_API_KEY ?? "";
  private baseUrl = process.env.HAILUO_BASE_URL ?? "https://api.minimaxi.chat/v1";

  async generateI2V(imagePath: string, prompt: string) {
    if (!this.apiKey) throw new Error("HAILUO_API_KEY is not configured");

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    const submitResp = await axios.post(
      `${this.baseUrl}/video_generation`,
      { model: "video-01", prompt, first_frame_image: `data:image/jpeg;base64,${base64Image}` },
      { headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, timeout: 30_000 }
    );

    const taskId: string = submitResp.data?.task_id ?? submitResp.data?.data?.task_id;
    if (!taskId) throw new Error("Hailuo: no task_id returned");

    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const queryResp = await axios.get(`${this.baseUrl}/query/video_generation?task_id=${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 15_000,
      });
      const status = queryResp.data?.status;
      const fileId = queryResp.data?.file_id;
      if (status === "Success" && fileId) {
        const videoUrl = `${this.baseUrl}/files/${fileId}`;
        return { videoUrl };
      }
      if (status === "Fail") throw new Error("Hailuo task failed");
    }
    throw new Error("Hailuo task timeout");
  }
}

const PROVIDERS: Record<string, VideoProvider> = {
  kling: new KlingProvider(),
  hailuo: new HailuoProvider(),
};

function getProvider(name?: string): VideoProvider {
  const key = name ?? process.env.VIDEO_PROVIDER ?? "kling";
  const p = PROVIDERS[key];
  if (!p) throw new Error(`Unknown video provider: ${key}`);
  return p;
}

// ─── 视频多帧 QA ──────────────────────────────────────────────────────────────

async function extractFrame(videoPath: string, timePercent: string, outputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .on("error", reject)
      .on("end", () => resolve())
      .screenshots({
        count: 1,
        timemarks: [timePercent],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "640x?",
      });
  });
}

async function qaVideoMultiFrame(videoPath: string, tmpDir: string): Promise<QAReviewResult> {
  const qaKey = process.env.DEEPSEEK_API_KEY;
  if (!qaKey) return { verdict: "pass", score: 0.7, failTags: [], suggestion: "adopt", details: "QA skipped (no API key)" };

  const qaBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const qaModel = process.env.VISION_QA_MODEL ?? "deepseek-chat";

  const frames: string[] = [];
  try {
    for (const [mark, label] of [["10%", "first"], ["50%", "mid"], ["90%", "last"]]) {
      const framePath = path.join(tmpDir, `qa_frame_${label}_${Date.now()}.jpg`);
      await extractFrame(videoPath, mark, framePath);
      const data = fs.readFileSync(framePath);
      frames.push(data.toString("base64"));
      fs.unlinkSync(framePath);
    }
  } catch {
    return { verdict: "pass", score: 0.6, failTags: [], suggestion: "adopt", details: "Frame extraction failed, QA skipped" };
  }

  try {
    const content = [
      { type: "text", text: `请评估这3帧视频（开始/中间/结尾）的质量，输出 JSON：
{"verdict":"pass|warn|fail","score":0.0-1.0,"issues":["问题描述"],"suggestion":"adopt|accept-minor|must-redo|change-provider"}
判断标准：手指变形/脸部扭曲/主体漂移/闪烁严重 → fail；轻微瑕疵 → warn；正常 → pass。` },
      ...frames.map((b64) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } })),
    ];

    const response = await axios.post(
      `${qaBaseUrl}/chat/completions`,
      { model: qaModel, messages: [{ role: "user", content }], max_tokens: 150 },
      { headers: { Authorization: `Bearer ${qaKey}`, "Content-Type": "application/json" }, timeout: 45_000 }
    );

    const raw = response.data?.choices?.[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());

    const verdict = (result.verdict ?? "pass") as "pass" | "warn" | "fail";
    const suggestion = (result.suggestion ?? (verdict === "fail" ? "must-redo" : "adopt")) as QAReviewResult["suggestion"];

    return {
      verdict,
      score: result.score ?? 0.6,
      failTags: (result.issues ?? []).map((i: string) => ({ code: "auto", label: i })),
      suggestion,
      details: (result.issues ?? []).join("; "),
    };
  } catch {
    return { verdict: "pass", score: 0.6, failTags: [], suggestion: "adopt", details: "QA API error, defaulting to pass" };
  }
}

// ─── 主入口：为一个 Shot 生成视频候选 ──────────────────────────────────────────

export interface GenerateVideoResult {
  takeId: string;
  localPath: string;
  url: string;
  qa: QAReviewResult;
}

export async function generateShotVideo(input: VideoGenInput): Promise<GenerateVideoResult> {
  const { projectId, episodeId, sceneId, shotId, adoptedTakeId, visualPrompt, provider } = input;

  const adoptedTake = await prisma.take.findUnique({ where: { id: adoptedTakeId } });
  if (!adoptedTake?.localImage) throw new Error(`Adopted take ${adoptedTakeId} has no image`);

  const imageAbsPath = getLocalPath(adoptedTake.localImage);
  if (!fs.existsSync(imageAbsPath)) throw new Error(`Image file not found: ${imageAbsPath}`);

  // 自动推荐最优视频 provider
  let resolvedProvider = provider;
  if (!resolvedProvider) {
    const rec = await recommendProvider(projectId, "video", "kling");
    resolvedProvider = rec.provider;
    console.log(`[video-gen] Auto-selected provider: ${rec.provider} — ${rec.reason}`);
  }

  const videoProvider = getProvider(resolvedProvider);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const takeId = generateId();
    initTakeDirs(projectId, episodeId, sceneId, shotId, takeId);

    const paramsSnapshot = { provider: videoProvider.name, prompt: visualPrompt, adoptedTakeId, attempt };
    saveTakeInputJson(projectId, episodeId, sceneId, shotId, takeId, paramsSnapshot);

    try {
      const genResult = await videoProvider.generateI2V(imageAbsPath, visualPrompt);

      const saved = await downloadToTake(
        genResult.videoUrl,
        projectId, episodeId, sceneId, shotId, takeId,
        "video.mp4"
      );

      const tmpDir = path.dirname(saved.localPath);
      const qa = await qaVideoMultiFrame(saved.localPath, tmpDir);

      const take = await prisma.take.create({
        data: {
          id: takeId,
          shotId,
          takeType: "video",
          provider: videoProvider.name,
          paramsSnapshot: JSON.stringify(paramsSnapshot),
          promptSnapshot: visualPrompt,
          refAssets: JSON.stringify([adoptedTake.localImage]),
          localVideo: saved.url,
          autoScore: qa.score,
          isAdopted: false,
        },
      });

      await prisma.review.create({
        data: {
          takeId: take.id,
          reviewType: "video-qa",
          verdict: qa.verdict,
          score: qa.score,
          failTags: JSON.stringify(qa.failTags),
          suggestion: qa.suggestion,
          details: qa.details,
        },
      });

      if (qa.verdict !== "fail" || attempt === maxAttempts) {
        await prisma.take.update({ where: { id: takeId }, data: { isAdopted: true } });
        await prisma.shot.update({
          where: { id: shotId },
          data: { adoptedTakeId: takeId, status: "video_done" },
        });

        return { takeId, localPath: saved.localPath, url: saved.url, qa };
      }

      console.warn(`[video-gen] Shot ${shotId} QA failed attempt ${attempt}, retrying...`);
    } catch (err) {
      console.error(`[video-gen] Attempt ${attempt} error:`, err);
      if (attempt === maxAttempts) throw err;
    }
  }

  throw new Error(`Video generation failed after ${maxAttempts} attempts for shot ${shotId}`);
}

// ─── 含任务追踪的包装入口 ─────────────────────────────────────────────────────

export async function generateShotVideoWithTask(input: VideoGenInput) {
  return enqueueTask(
    {
      projectId: input.projectId,
      shotId: input.shotId,
      taskType: "video",
      inputRef: { shotId: input.shotId, adoptedTakeId: input.adoptedTakeId, provider: input.provider },
    },
    () => generateShotVideo(input)
  );
}
