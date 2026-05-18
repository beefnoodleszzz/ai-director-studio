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
import { enqueueTask, markCurrentTaskBlocked } from "@/lib/task-queue";
import { generateId, sleep } from "@/lib/utils";
import { recommendProvider } from "@/lib/provider-recommender";
import { normalizeShotStateById, recalculateEpisodeStage } from "@/lib/production-state";
import type { VideoGenInput, QAReviewResult } from "./types";
import { buildBlockMeta } from "@/lib/studio-contracts";
import { buildContinuityContext } from "@/lib/continuity";
import { composeVideoPrompt } from "@/lib/prompt-composer";
import { selectCharacterAssetsForShot } from "@/lib/character-asset-selector";
import { findTag } from "@/lib/qa-tags";
import { deriveRetryStrategyFromFailTags } from "@/lib/retry-strategy";

// ─── Provider 抽象 ────────────────────────────────────────────────────────────

interface VideoProvider {
  name: string;
  generateI2V(imagePath: string, prompt: string): Promise<{ videoUrl: string; localHint?: string }>;
}

class SeedanceProvider implements VideoProvider {
  name = "seedance";
  private apiKey = process.env.SEEDANCE_API_KEY ?? "";
  private baseUrl = process.env.SEEDANCE_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";

  async generateI2V(imagePath: string, prompt: string) {
    if (!this.apiKey) throw new Error("SEEDANCE_API_KEY is not configured");

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");
    const model = process.env.VIDEO_MODEL ?? "doubao-seedance-1-0-pro-250528";

    const response = await axios.post(
      `${this.baseUrl}/contents/generations/tasks`,
      {
        model,
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      }
    );

    const taskId: string =
      response.data?.id ??
      response.data?.task_id ??
      response.data?.data?.id;
    if (!taskId) {
      throw new Error(`Seedance: no task id returned: ${JSON.stringify(response.data)}`);
    }

    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const pollResp = await axios.get(`${this.baseUrl}/contents/generations/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 15_000,
      });

      const task = pollResp.data?.data ?? pollResp.data;
      const status: string | undefined = task?.status;
      const videoUrl: string | undefined =
        task?.content?.video_url ??
        task?.content?.video?.url ??
        task?.result?.video_url ??
        task?.video_url;

      if ((status === "succeeded" || status === "completed" || status === "success") && videoUrl) {
        return { videoUrl };
      }
      if (status === "failed" || status === "error") {
        throw new Error(`Seedance task failed: ${JSON.stringify(task)}`);
      }
    }

    throw new Error("Seedance task timeout");
  }
}

const PROVIDERS: Record<string, VideoProvider> = {
  seedance: new SeedanceProvider(),
};

function getProvider(name?: string): VideoProvider {
  const key = name ?? process.env.VIDEO_PROVIDER ?? "seedance";
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
  if (!qaKey) return { verdict: "warn", score: 0.3, failTags: [], suggestion: "accept-minor", details: "Video QA unavailable" };

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
    return { verdict: "warn", score: 0.3, failTags: [], suggestion: "accept-minor", details: "Frame extraction failed" };
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
    return { verdict: "warn", score: 0.3, failTags: [], suggestion: "accept-minor", details: "Video QA fallback" };
  }
}

async function qaVideoContinuity(input: {
  framesBase64: string[];
  continuitySummary: string;
  subjectSummary: string;
  selectedAssetSummary: string;
}): Promise<QAReviewResult> {
  const qaKey = process.env.DEEPSEEK_API_KEY;
  if (!qaKey || input.framesBase64.length === 0) {
    return { verdict: "warn", score: 0.3, failTags: [], suggestion: "accept-minor", details: "Continuity QA unavailable" };
  }

  const qaBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const qaModel = process.env.VISION_QA_MODEL ?? "deepseek-chat";

  try {
    const content = [
      {
        type: "text",
        text: `请评估这组视频帧的强一致性，只从以下标签中返回 JSON：
{"verdict":"pass|warn|fail","score":0.0-1.0,"failTags":["face-inconsistency|hairstyle-change|wardrobe-drift|temporal-inconsistency|continuity-break"],"details":["问题描述"]}
角色摘要：${input.subjectSummary || "none"}
上一镜头承接：${input.continuitySummary || "none"}
当前已选角色资产：${input.selectedAssetSummary || "none"}
重点判断：角色身份是否漂移、发型服装是否跳变、镜头承接是否突兀、帧间是否明显不连续。`,
      },
      ...input.framesBase64.map((b64) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } })),
    ];

    const response = await axios.post(
      `${qaBaseUrl}/chat/completions`,
      { model: qaModel, messages: [{ role: "user", content }], max_tokens: 180 },
      { headers: { Authorization: `Bearer ${qaKey}`, "Content-Type": "application/json" }, timeout: 45_000 }
    );

    const raw = response.data?.choices?.[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    const failTags = Array.isArray(result.failTags)
      ? result.failTags
          .filter((tag: string) => Boolean(findTag(tag)))
          .map((tag: string) => ({ code: tag, label: findTag(tag)?.label ?? tag }))
      : [];

    return {
      verdict: (result.verdict ?? "pass") as "pass" | "warn" | "fail",
      score: result.score ?? 0.68,
      failTags,
      suggestion: ((result.verdict ?? "pass") === "fail" ? "must-redo" : "adopt") as QAReviewResult["suggestion"],
      details: Array.isArray(result.details) ? result.details.join("; ") : String(result.details ?? ""),
    };
  } catch {
    return { verdict: "warn", score: 0.3, failTags: [], suggestion: "accept-minor", details: "Continuity QA fallback" };
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
  const {
    projectId,
    episodeId,
    sceneId,
    shotId,
    adoptedImageTakeId,
    visualPrompt,
    provider,
    stopOnQaFail = true,
  } = input;
  const resolvedAdoptedImageTakeId = adoptedImageTakeId;

  if (!resolvedAdoptedImageTakeId) {
    throw new Error("adoptedImageTakeId is required");
  }

  const adoptedTake = await prisma.take.findUnique({ where: { id: resolvedAdoptedImageTakeId } });
  if (!adoptedTake?.localImage) throw new Error(`Adopted take ${resolvedAdoptedImageTakeId} has no image`);

  const imageAbsPath = getLocalPath(adoptedTake.localImage);
  if (!fs.existsSync(imageAbsPath)) throw new Error(`Image file not found: ${imageAbsPath}`);

  const shot = await prisma.shot.findUnique({ where: { id: shotId } });
  if (!shot) throw new Error(`Shot ${shotId} not found`);

  await prisma.shot.update({
    where: { id: shotId },
    data: {
      pipelineStage: "video_generating",
      blockReason: "",
      blockMeta: "",
    },
  });

  const subjectSummary = input.subjectSummary ?? await buildSubjectSummary(shot.subjectCharIds);
  const continuity = await buildContinuityContext({
    shotId,
    sceneId,
    shotOrder: shot.shotOrder,
  });
  const selectedAssets = await selectCharacterAssetsForShot({
    subjectCharIdsRaw: shot.subjectCharIds,
    cameraAngle: shot.cameraAngle,
    emotionGoal: shot.emotionGoal,
  });
  const constrainedPrompt = composeVideoPrompt({
    basePrompt: `${visualPrompt}${selectedAssets.summary ? `, selected role assets: ${selectedAssets.summary}` : ""}`,
    subjectSummary,
    referenceAssetUrls: Array.from(
      new Set([
        ...(input.referenceAssetUrls ?? []),
        ...selectedAssets.referenceAssetUrls,
        ...continuity.referenceAssetUrls,
      ])
    ),
    continuitySummary: continuity.summary,
  });

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
    const previousVideoFailure =
      attempt > 1
        ? await prisma.review.findFirst({
            where: {
              take: { shotId, takeType: "video" },
              reviewType: "video-qa",
              verdict: { in: ["fail", "warn"] },
            },
            orderBy: { reviewedAt: "desc" },
          })
        : null;
    const previousFailTags: string[] = previousVideoFailure?.failTags
      ? (() => {
          try {
            const parsed = JSON.parse(previousVideoFailure.failTags) as Array<{ code?: string } | string>;
            return parsed.map((item) => typeof item === "string" ? item : item.code ?? "").filter(Boolean);
          } catch {
            return [];
          }
        })()
      : [];
    const retryStrategy = deriveRetryStrategyFromFailTags(previousFailTags);
    const retryPrompt = retryStrategy.promptHints.length > 0
      ? `${constrainedPrompt}, retry guidance: ${retryStrategy.promptHints.join(", ")}`
      : constrainedPrompt;
    const continuityReferenceUrls = retryStrategy.disableContinuityReference ? [] : continuity.referenceAssetUrls;
    initTakeDirs(projectId, episodeId, sceneId, shotId, takeId);

    const paramsSnapshot = {
      provider: videoProvider.name,
      prompt: visualPrompt,
      constrainedPrompt: retryPrompt,
      adoptedImageTakeId: resolvedAdoptedImageTakeId,
      subjectSummary,
      continuitySummary: continuity.summary,
      attempt,
      retryStrategy,
    };
    saveTakeInputJson(projectId, episodeId, sceneId, shotId, takeId, paramsSnapshot);

    try {
      const genResult = await videoProvider.generateI2V(imageAbsPath, retryPrompt);

      const saved = await downloadToTake(
        genResult.videoUrl,
        projectId, episodeId, sceneId, shotId, takeId,
        "video.mp4"
      );

      const tmpDir = path.dirname(saved.localPath);
      const qa = await qaVideoMultiFrame(saved.localPath, tmpDir);
      const continuityFrames = await (async () => {
        const frames: string[] = [];
        try {
          for (const [mark, label] of [["10%", "first"], ["50%", "mid"], ["90%", "last"]] as const) {
            const framePath = path.join(tmpDir, `continuity_frame_${label}_${Date.now()}.jpg`);
            await extractFrame(saved.localPath, mark, framePath);
            const data = fs.readFileSync(framePath);
            frames.push(data.toString("base64"));
            fs.unlinkSync(framePath);
          }
        } catch {
          return [] as string[];
        }
        return frames;
      })();
      const continuityQa = await qaVideoContinuity({
        framesBase64: continuityFrames,
        continuitySummary: continuity.summary,
        subjectSummary,
        selectedAssetSummary: selectedAssets.summary,
      });
      const mergedFailTags = Array.from(
        new Map(
          [...qa.failTags, ...continuityQa.failTags].map((tag) => [tag.code, tag])
        ).values()
      );
      const mergedScore = Number(((qa.score * 0.6) + (continuityQa.score * 0.4)).toFixed(3));
      const mergedVerdict =
        qa.verdict === "fail" || continuityQa.verdict === "fail"
          ? "fail"
          : qa.verdict === "warn" || continuityQa.verdict === "warn"
            ? "warn"
            : "pass";
      const mergedDetails = [qa.details, continuityQa.details].filter(Boolean).join(" | ");

      const take = await prisma.take.create({
        data: {
          id: takeId,
          shotId,
          takeType: "video",
          provider: videoProvider.name,
          paramsSnapshot: JSON.stringify(paramsSnapshot),
          promptSnapshot: retryPrompt,
          refAssets: JSON.stringify(
            Array.from(
              new Set([
                adoptedTake.localImage,
                ...selectedAssets.referenceAssetUrls,
                ...continuityReferenceUrls,
              ].filter(Boolean))
            )
          ),
          localVideo: saved.url,
          autoScore: mergedScore,
          isAdopted: false,
        },
      });

      await prisma.review.create({
        data: {
          takeId: take.id,
          reviewType: "video-qa",
          verdict: mergedVerdict,
          score: mergedScore,
          failTags: JSON.stringify(mergedFailTags),
          suggestion: mergedVerdict === "fail" ? "must-redo" : "adopt",
          details: mergedDetails,
        },
      });

      if (mergedVerdict !== "fail" || attempt === maxAttempts) {
        await prisma.take.updateMany({
          where: { shotId, takeType: "video", isAdopted: true },
          data: { isAdopted: false },
        });
        await prisma.take.update({ where: { id: takeId }, data: { isAdopted: true } });
        if (mergedVerdict === "fail" && stopOnQaFail) {
          const isContinuityFailure = mergedFailTags.some((tag) => tag.code === "continuity-break");
          const blockMeta = {
            code: isContinuityFailure ? "continuity-check-failed" as const : "video-qa-failed" as const,
            message: isContinuityFailure
              ? "Continuity QA failed and manual review is required."
              : "Video QA failed and manual review is required.",
            stage: "video" as const,
            shotId,
            takeId,
            details: mergedFailTags.map((tag) => tag.label).filter(Boolean),
          };

          await prisma.shot.update({
            where: { id: shotId },
            data: {
              adoptedVideoTakeId: takeId,
              blockReason: blockMeta.code,
              blockMeta: buildBlockMeta(blockMeta),
            },
          });
          await markCurrentTaskBlocked({
            blockReason: blockMeta.code,
            blockMeta,
          });
        } else {
          await prisma.shot.update({
            where: { id: shotId },
            data: {
              adoptedVideoTakeId: takeId,
              blockReason: "",
              blockMeta: "",
            },
          });
        }

        await normalizeShotStateById(shotId);
        await recalculateEpisodeStage(episodeId);

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

async function buildSubjectSummary(subjectCharIdsRaw: string | null | undefined) {
  if (!subjectCharIdsRaw) return "";
  let ids: string[] = [];
  try {
    ids = JSON.parse(subjectCharIdsRaw);
  } catch {
    return "";
  }
  if (!ids.length) return "";
  const characters = await prisma.characterBible.findMany({
    where: { id: { in: ids } },
    select: {
      name: true,
      anchorFace: true,
      anchorHair: true,
      wardrobeBase: true,
      temperamentTags: true,
    },
  });
  return characters
    .map((c) =>
      `${c.name}: face=${c.anchorFace}; hair=${c.anchorHair}; wardrobe=${c.wardrobeBase}; aura=${c.temperamentTags}`
    )
    .join(" | ");
}

// ─── 含任务追踪的包装入口 ─────────────────────────────────────────────────────

export async function generateShotVideoWithTask(input: VideoGenInput) {
  return enqueueTask(
    {
      projectId: input.projectId,
      shotId: input.shotId,
      taskType: "video",
      taskStage: "video",
      parentTaskId: input.parentTaskId,
      inputRef: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        sceneId: input.sceneId,
        shotId: input.shotId,
        adoptedImageTakeId: input.adoptedImageTakeId,
        visualPrompt: input.visualPrompt,
        provider: input.provider,
        subjectSummary: input.subjectSummary,
        referenceAssetUrls: input.referenceAssetUrls,
        autoContinue: input.autoContinue,
        stopOnQaFail: input.stopOnQaFail ?? true,
        parentTaskId: input.parentTaskId,
        outputType: "video",
        stage: "video",
      },
    },
    () => generateShotVideo(input)
  );
}
