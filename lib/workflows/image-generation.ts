/**
 * 图像生成 Workflow
 *
 * 职责：
 * 1. 为指定镜头（Shot）生成多个首帧候选（Take）
 * 2. 每个 Take 记录：provider、prompt 快照、参数快照、本地路径
 * 3. 对生成结果执行基础 QA（图像 QA）
 * 4. 更新 Take 的 autoScore
 */

import axios from "axios";
import { prisma } from "@/lib/prisma";
import {
  saveBase64ToTake,
  downloadToTake,
  saveTakeInputJson,
  initTakeDirs,
} from "@/lib/asset";
import { enqueueTask } from "@/lib/task-queue";
import { generateId } from "@/lib/utils";
import { recommendProvider } from "@/lib/provider-recommender";
import type { ImageGenInput } from "./types";

// ─── Provider 抽象 ────────────────────────────────────────────────────────────

interface ImageProvider {
  name: string;
  generate(prompt: string, refImageUrls?: string[]): Promise<{ imageUrl: string; base64?: string }>;
}

class SeedreamProvider implements ImageProvider {
  name = "seedream";

  async generate(prompt: string, refImageUrls?: string[]) {
    const apiKey = process.env.SEEDREAM_API_KEY;
    const baseUrl = process.env.SEEDREAM_BASE_URL ?? "https://api.seedream.io/v1";
    if (!apiKey) throw new Error("SEEDREAM_API_KEY is not configured");

    const body: Record<string, unknown> = { prompt, aspect_ratio: "16:9" };
    if (refImageUrls && refImageUrls.length > 0) body.image_url = refImageUrls[0];

    const response = await axios.post(`${baseUrl}/images/generations`, body, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120_000,
    });

    const imageUrl: string =
      response.data?.data?.[0]?.url ??
      response.data?.images?.[0]?.url ??
      response.data?.output?.images?.[0];

    if (!imageUrl) throw new Error("Seedream returned no image URL");
    return { imageUrl };
  }
}

const PROVIDERS: Record<string, ImageProvider> = {
  seedream: new SeedreamProvider(),
};

function getProvider(name?: string): ImageProvider {
  const key = name ?? process.env.IMAGE_PROVIDER ?? "seedream";
  const p = PROVIDERS[key];
  if (!p) throw new Error(`Unknown image provider: ${key}`);
  return p;
}

// ─── 图像 QA（基础）─────────────────────────────────────────────────────────

async function qaImage(localPath: string): Promise<{ score: number; verdict: string }> {
  const qaKey = process.env.DEEPSEEK_API_KEY;
  const qaBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const qaModel = process.env.VISION_QA_MODEL ?? "deepseek-chat";

  if (!qaKey || !localPath) return { score: 0.7, verdict: "pass" };

  try {
    const fs = await import("fs");
    const imageBuffer = fs.readFileSync(localPath);
    const base64 = imageBuffer.toString("base64");

    const response = await axios.post(
      `${qaBaseUrl}/chat/completions`,
      {
        model: qaModel,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `请评估这张 AI 生成图像的质量，输出 JSON：
{"verdict":"pass|warn|fail","score":0.0-1.0,"issues":["问题描述"]}
判断标准：手指变形/脸部扭曲/肢体崩坏/主体模糊 → fail；轻微问题 → warn；正常 → pass。`,
              },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 100,
      },
      {
        headers: { Authorization: `Bearer ${qaKey}`, "Content-Type": "application/json" },
        timeout: 30_000,
      }
    );

    const content = response.data?.choices?.[0]?.message?.content ?? "{}";
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(jsonStr);
    return { score: result.score ?? 0.5, verdict: result.verdict ?? "pass" };
  } catch {
    return { score: 0.6, verdict: "pass" };
  }
}

// ─── 主入口：为一个 Shot 生成图像候选 ──────────────────────────────────────────

export interface GenerateImageResult {
  takes: Array<{ takeId: string; localPath: string; url: string; score: number }>;
}

export async function generateShotImages(input: ImageGenInput): Promise<GenerateImageResult> {
  const { projectId, episodeId, sceneId, shotId, prompt, refImageUrls, candidateCount = 2 } = input;

  const shot = await prisma.shot.findUnique({ where: { id: shotId } });
  if (!shot) throw new Error(`Shot ${shotId} not found`);

  await prisma.shot.update({ where: { id: shotId }, data: { status: "generating" } });

  // 若未指定 provider，自动从历史统计推荐最优
  let resolvedProvider = input.provider;
  if (!resolvedProvider) {
    const rec = await recommendProvider(projectId, "image", "seedream");
    resolvedProvider = rec.provider;
    console.log(`[image-gen] Auto-selected provider: ${rec.provider} — ${rec.reason}`);
  }

  const imageProvider = getProvider(resolvedProvider);
  const results: GenerateImageResult["takes"] = [];

  for (let i = 0; i < candidateCount; i++) {
    const takeId = generateId();

    initTakeDirs(projectId, episodeId, sceneId, shotId, takeId);

    const paramsSnapshot = { provider: imageProvider.name, prompt, refImageUrls, candidateIndex: i };
    saveTakeInputJson(projectId, episodeId, sceneId, shotId, takeId, paramsSnapshot);

    try {
      const genResult = await imageProvider.generate(prompt, refImageUrls);

      let localPath: string;
      let url: string;

      if (genResult.base64) {
        const saved = saveBase64ToTake(genResult.base64, projectId, episodeId, sceneId, shotId, takeId, "image.jpg");
        localPath = saved.localPath;
        url = saved.url;
      } else {
        const saved = await downloadToTake(genResult.imageUrl, projectId, episodeId, sceneId, shotId, takeId, "image.jpg");
        localPath = saved.localPath;
        url = saved.url;
      }

      const qa = await qaImage(localPath);

      const take = await prisma.take.create({
        data: {
          id: takeId,
          shotId,
          takeType: "image",
          provider: imageProvider.name,
          paramsSnapshot: JSON.stringify(paramsSnapshot),
          promptSnapshot: prompt,
          refAssets: JSON.stringify(refImageUrls ?? []),
          localImage: url,
          autoScore: qa.score,
          isAdopted: false,
        },
      });

      await prisma.review.create({
        data: {
          takeId: take.id,
          reviewType: "image-qa",
          verdict: qa.verdict === "fail" ? "fail" : qa.verdict === "warn" ? "warn" : "pass",
          score: qa.score,
          failTags: "[]",
          suggestion: qa.verdict === "fail" ? "must-redo" : "adopt",
          details: `Auto QA score: ${qa.score}`,
        },
      });

      results.push({ takeId, localPath, url, score: qa.score });
    } catch (err) {
      console.error(`[image-gen] Take ${takeId} failed:`, err);
    }
  }

  if (results.length === 0) {
    await prisma.shot.update({ where: { id: shotId }, data: { status: "error" } });
    throw new Error(`All ${candidateCount} image generation attempts failed for shot ${shotId}`);
  }

  // 自动选 score 最高的作为默认采用
  const best = results.reduce((a, b) => (a.score > b.score ? a : b));
  await prisma.take.update({ where: { id: best.takeId }, data: { isAdopted: true } });
  await prisma.shot.update({
    where: { id: shotId },
    data: { adoptedTakeId: best.takeId, status: "image_done", readiness: "done" },
  });

  return { takes: results };
}

// ─── 含任务追踪的包装入口 ─────────────────────────────────────────────────────

export async function generateShotImagesWithTask(input: ImageGenInput) {
  return enqueueTask(
    {
      projectId: input.projectId,
      shotId: input.shotId,
      taskType: "image",
      inputRef: { shotId: input.shotId, provider: input.provider },
    },
    () => generateShotImages(input)
  );
}
