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
import { dispatchTask, getCurrentTaskId } from "@/lib/task-queue";
import { generateId } from "@/lib/utils";
import { recommendProvider } from "@/lib/provider-recommender";
import { normalizeShotStateById, recalculateEpisodeStage } from "@/lib/production-state";
import type { ImageGenInput } from "./types";
import { composeImagePrompt } from "@/lib/prompt-composer";
import { generateShotVideoWithTask } from "./video-generation";
import { selectCharacterAssetsForShot } from "@/lib/character-asset-selector";
import { findTag } from "@/lib/qa-tags";
import { deriveRetryStrategyFromFailTags } from "@/lib/retry-strategy";
import {
  DEFAULT_IMAGE_PROVIDER,
  buildImageGenerationBody,
  extractGeneratedImage,
  resolveImageProviderConfig,
  resolveImageRequestTimeoutMs,
} from "@/lib/image-api";

// ─── Provider 抽象 ────────────────────────────────────────────────────────────

interface ImageProvider {
  name: string;
  generate(
    prompt: string,
    refImageUrls?: string[],
    options?: { aspectRatio?: string; negativePrompt?: string }
  ): Promise<{ imageUrl: string; base64?: string }>;
}

class SakuraImageProvider implements ImageProvider {
  name = DEFAULT_IMAGE_PROVIDER;

  async generate(
    prompt: string,
    _refImageUrls?: string[],
    options?: { aspectRatio?: string; negativePrompt?: string }
  ) {
    const { apiKey, baseUrl } = resolveImageProviderConfig();
    if (!apiKey) throw new Error("IMAGE_API_KEY is not configured");

    const body = buildImageGenerationBody(prompt, options);

    let response;
    try {
      response = await axios.post(`${baseUrl}/images/generations`, body, {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        timeout: resolveImageRequestTimeoutMs(),
      });
    } catch (e) {
      if (axios.isAxiosError(e) && e.response) {
        const detail =
          typeof e.response.data === "object"
            ? JSON.stringify(e.response.data)
            : String(e.response.data);
        const code = e.response.headers["x-error-code"] ?? e.response.headers["x-request-id"];
        throw new Error(
          `Sakura image API HTTP ${e.response.status}${code ? ` (${String(code)})` : ""}: ${detail}`
        );
      }
      throw e;
    }

    return extractGeneratedImage(response.data);
  }
}

const sakuraProvider = new SakuraImageProvider();
const PROVIDERS: Record<string, ImageProvider> = {
  [DEFAULT_IMAGE_PROVIDER]: sakuraProvider,
  seedream: sakuraProvider,
};

function getProvider(name?: string): ImageProvider {
  const key = name ?? process.env.IMAGE_PROVIDER ?? DEFAULT_IMAGE_PROVIDER;
  const p = PROVIDERS[key];
  if (!p) throw new Error(`Unknown image provider: ${key}`);
  return p;
}

// ─── 图像 QA（基础）─────────────────────────────────────────────────────────

async function qaImage(localPath: string): Promise<{ score: number; verdict: string }> {
  const qaKey = process.env.DEEPSEEK_API_KEY;
  const qaBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const qaModel = process.env.VISION_QA_MODEL ?? "deepseek-chat";

  if (!qaKey || !localPath) return { score: 0.3, verdict: "warn" };

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
    return { score: 0.3, verdict: "warn" };
  }
}

async function qaImageConsistency(input: {
  localPath: string;
  characterNames: string[];
  anchorFace: string[];
  anchorHair: string[];
  selectedAssetTypes: string[];
  emotionGoal: string;
  cameraAngle: string;
}): Promise<{ score: number; verdict: "pass" | "warn" | "fail"; failTags: string[]; details: string }> {
  const qaKey = process.env.DEEPSEEK_API_KEY;
  const qaBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const qaModel = process.env.VISION_QA_MODEL ?? "deepseek-chat";

  if (!qaKey || !input.localPath) {
    return { score: 0.35, verdict: "warn", failTags: [], details: "Consistency QA unavailable" };
  }

  try {
    const fs = await import("fs");
    const imageBuffer = fs.readFileSync(input.localPath);
    const base64 = imageBuffer.toString("base64");
    const selectedAssets = input.selectedAssetTypes.join(", ");

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
                text: `请只从以下标签中评估这张角色图的一致性并输出 JSON：
{"verdict":"pass|warn|fail","score":0.0-1.0,"failTags":["face-inconsistency|wardrobe-drift|hairstyle-change|wrong-expression|wrong-angle-reference"],"details":["问题描述"]}
角色：${input.characterNames.join(", ") || "unknown"}
脸部锚点：${input.anchorFace.join("; ") || "none"}
发型锚点：${input.anchorHair.join("; ") || "none"}
目标情绪：${input.emotionGoal || "none"}
目标机位：${input.cameraAngle || "none"}
已选角色资产：${selectedAssets || "none"}
判断重点：角色脸是否稳定、发型是否正确、表情是否符合、角度是否基本符合。`,
              },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 160,
      },
      {
        headers: { Authorization: `Bearer ${qaKey}`, "Content-Type": "application/json" },
        timeout: 30_000,
      }
    );

    const content = response.data?.choices?.[0]?.message?.content ?? "{}";
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(jsonStr);
    const failTags = Array.isArray(result.failTags)
      ? result.failTags.filter((tag: string) => Boolean(findTag(tag)))
      : [];
    const verdict = (result.verdict ?? "pass") as "pass" | "warn" | "fail";

    return {
      score: result.score ?? 0.65,
      verdict,
      failTags,
      details: Array.isArray(result.details) ? result.details.join("; ") : String(result.details ?? ""),
    };
  } catch {
    return { score: 0.35, verdict: "warn", failTags: [], details: "Consistency QA fallback" };
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

  // 读取项目宽高比与 StyleBible（影响宽高比和视觉风格注入）
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { aspect: true, styleBible: true },
  });
  const projectAspect = project?.aspect ?? "9:16";
  const styleBible = project?.styleBible
    ? {
        visualStyle: project.styleBible.visualStyle,
        colorStrategy: project.styleBible.colorStrategy,
        eraAesthetic: project.styleBible.eraAesthetic,
        negativeKeywords: project.styleBible.negativeKeywords,
        genreTag: project.styleBible.genreTag,
      }
    : undefined;

  await prisma.shot.update({
    where: { id: shotId },
    data: {
      pipelineStage: "image_generating",
      blockReason: "",
      blockMeta: "",
    },
  });

  // 若未指定 provider，自动从历史统计推荐最优
  let resolvedProvider = input.provider;
  if (!resolvedProvider) {
    const rec = await recommendProvider(projectId, "image", DEFAULT_IMAGE_PROVIDER);
    resolvedProvider = rec.provider;
    console.log(`[image-gen] Auto-selected provider: ${rec.provider} — ${rec.reason}`);
  }

  const imageProvider = getProvider(resolvedProvider);
  const results: GenerateImageResult["takes"] = [];
  const resolvedPrompt = prompt?.trim() || shot.visualPrompt?.trim();
  if (!resolvedPrompt) {
    await prisma.shot.update({
      where: { id: shotId },
      data: { pipelineStage: "draft" },
    });
    throw new Error(`No visual prompt available for shot ${shotId}`);
  }
  const characterConstraints = input.characterConstraints ?? await buildCharacterConstraints(
    shot.subjectCharIds,
    shot.cameraAngle,
    shot.emotionGoal
  );
  const finalRefUrls = Array.from(new Set([...(refImageUrls ?? []), ...characterConstraints.refAssetUrls])).slice(0, 6);
  const composed = composeImagePrompt(
    `${resolvedPrompt}${characterConstraints.selectionSummary ? `, selected role assets: ${characterConstraints.selectionSummary}` : ""}`,
    characterConstraints,
    styleBible
  );
  const constrainedPrompt = composed.prompt;
  const negativePrompt = composed.negativePrompt;

  for (let i = 0; i < candidateCount; i++) {
    const takeId = generateId();
    const previousConsistencyFailures =
      i > 0 && results.length > 0
        ? await prisma.review.findFirst({
            where: {
              take: { shotId, takeType: "image" },
              reviewType: "image-qa",
              verdict: { in: ["fail", "warn"] },
            },
            orderBy: { reviewedAt: "desc" },
          })
        : null;
    const previousFailTags: string[] = previousConsistencyFailures?.failTags
      ? (() => {
          try {
            return JSON.parse(previousConsistencyFailures.failTags) as string[];
          } catch {
            return [];
          }
        })()
      : [];
    const retryStrategy = deriveRetryStrategyFromFailTags(previousFailTags);
    const retryPrompt = retryStrategy.promptHints.length > 0
      ? `${constrainedPrompt}, retry guidance: ${retryStrategy.promptHints.join(", ")}`
      : constrainedPrompt;

    initTakeDirs(projectId, episodeId, sceneId, shotId, takeId);

    const paramsSnapshot = {
      provider: imageProvider.name,
      prompt: resolvedPrompt,
      constrainedPrompt: retryPrompt,
      negativePrompt,
      aspectRatio: projectAspect,
      refImageUrls: finalRefUrls,
      characterConstraints,
      candidateIndex: i,
      retryStrategy,
    };
    saveTakeInputJson(projectId, episodeId, sceneId, shotId, takeId, paramsSnapshot);

    try {
      const genResult = await imageProvider.generate(retryPrompt, finalRefUrls, {
        aspectRatio: projectAspect,
        negativePrompt,
      });

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
      const consistencyQa = await qaImageConsistency({
        localPath,
        characterNames: characterConstraints.names,
        anchorFace: characterConstraints.anchorFace,
        anchorHair: characterConstraints.anchorHair,
        selectedAssetTypes: characterConstraints.selectedAssetTypes ?? [],
        emotionGoal: shot.emotionGoal,
        cameraAngle: shot.cameraAngle,
      });
      const mergedFailTags = Array.from(new Set(consistencyQa.failTags));
      const mergedScore = Number(((qa.score * 0.55) + (consistencyQa.score * 0.45)).toFixed(3));
      const mergedVerdict =
        qa.verdict === "fail" || consistencyQa.verdict === "fail"
          ? "fail"
          : qa.verdict === "warn" || consistencyQa.verdict === "warn"
            ? "warn"
            : "pass";
      const mergedDetails = [qa.verdict !== "pass" ? `Image QA: ${qa.verdict}` : "", consistencyQa.details]
        .filter(Boolean)
        .join(" | ");

      const take = await prisma.take.create({
        data: {
          id: takeId,
          shotId,
          takeType: "image",
          provider: imageProvider.name,
          paramsSnapshot: JSON.stringify(paramsSnapshot),
          promptSnapshot: retryPrompt,
          refAssets: JSON.stringify(finalRefUrls),
          localImage: url,
          autoScore: mergedScore,
          isAdopted: false,
        },
      });

      await prisma.review.create({
        data: {
          takeId: take.id,
          reviewType: "image-qa",
          verdict: mergedVerdict,
          score: mergedScore,
          failTags: JSON.stringify(mergedFailTags),
          suggestion: mergedVerdict === "fail" ? "must-redo" : "adopt",
          details: mergedDetails || `Auto QA score: ${mergedScore}`,
        },
      });

      results.push({ takeId, localPath, url, score: mergedScore });
    } catch (err) {
      console.error(`[image-gen] Take ${takeId} failed:`, err);
    }
  }

  if (results.length === 0) {
    await prisma.shot.update({
      where: { id: shotId },
      data: { pipelineStage: "draft" },
    });
    throw new Error(`All ${candidateCount} image generation attempts failed for shot ${shotId}`);
  }

  // 自动选 score 最高的作为默认采用
  const best = results.reduce((a, b) => (a.score > b.score ? a : b));
  await prisma.take.updateMany({
    where: { shotId, takeType: "image", isAdopted: true },
    data: { isAdopted: false },
  });
  await prisma.take.update({ where: { id: best.takeId }, data: { isAdopted: true } });
  await prisma.shot.update({
    where: { id: shotId },
    data: {
      adoptedImageTakeId: best.takeId,
      adoptedVideoTakeId: null,
      adoptedAudioTakeId: null,
    },
  });
  await normalizeShotStateById(shotId);
  await recalculateEpisodeStage(episodeId);

  const refreshedShot = await prisma.shot.findUnique({ where: { id: shotId }, select: { autoContinue: true } });
  if (refreshedShot?.autoContinue) {
    await generateShotVideoWithTask({
      projectId,
      episodeId,
      sceneId,
      shotId,
      adoptedImageTakeId: best.takeId,
      visualPrompt: shot.visualPrompt || prompt,
      autoContinue: true,
      stopOnQaFail: true,
      parentTaskId: getCurrentTaskId() ?? undefined,
    });
  }

  return { takes: results };
}

async function buildCharacterConstraints(
  subjectCharIdsRaw: string | null | undefined,
  cameraAngle = "",
  emotionGoal = ""
) {
  const fallback = {
    names: [] as string[],
    anchorFace: [] as string[],
    anchorHair: [] as string[],
    wardrobeBase: [] as string[],
    temperamentTags: [] as string[],
    refAssetUrls: [] as string[],
    selectedAssetTypes: [] as string[],
    selectionSummary: "",
  };
  if (!subjectCharIdsRaw) return fallback;
  let ids: string[] = [];
  try {
    ids = JSON.parse(subjectCharIdsRaw);
  } catch {
    return fallback;
  }
  if (!ids.length) return fallback;

  const characters = await prisma.characterBible.findMany({
    where: { id: { in: ids } },
    include: {
      assets: {
        where: {
          assetType: {
            in: [
              "reference-main",
              "angle-left",
              "angle-right",
              "angle-three-quarter",
              "expression-neutral",
              "expression-angry",
              "expression-sad",
              "expression-surprised",
              "reference",
              "angle",
              "expression",
              "costume",
            ],
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  // 主角始终排第一：防止配角（尤其老年角色）的特征排在前面污染生成结果
  characters.sort((a, b) => Number(b.isLead) - Number(a.isLead));

  const selectedAssets = await selectCharacterAssetsForShot({
    subjectCharIdsRaw,
    cameraAngle,
    emotionGoal,
  });

  return {
    names: characters.map((c) => c.name),
    anchorFace: characters.map((c) => c.anchorFace).filter(Boolean),
    anchorHair: characters.map((c) => c.anchorHair).filter(Boolean),
    wardrobeBase: characters.map((c) => c.wardrobeBase).filter(Boolean),
    temperamentTags: characters.flatMap((c) =>
      c.temperamentTags.split(",").map((t) => t.trim()).filter(Boolean)
    ),
    refAssetUrls: selectedAssets.referenceAssetUrls.length > 0
      ? selectedAssets.referenceAssetUrls
      : characters.flatMap((c) => c.assets.map((a) => a.localPath)).filter(Boolean),
    selectedAssetTypes: selectedAssets.selectedTypes,
    selectionSummary: selectedAssets.summary,
  };
}

// ─── 含任务追踪的包装入口 ─────────────────────────────────────────────────────

export async function generateShotImagesWithTask(input: ImageGenInput) {
  return dispatchTask(
    {
      projectId: input.projectId,
      shotId: input.shotId,
      taskType: "image",
      taskStage: "image",
      inputRef: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        sceneId: input.sceneId,
        shotId: input.shotId,
        prompt: input.prompt,
        refImageUrls: input.refImageUrls,
        provider: input.provider,
        candidateCount: input.candidateCount,
        templateId: input.templateId,
        characterConstraints: input.characterConstraints,
        outputType: "image",
        stage: "image",
      },
    },
    () => generateShotImages(input)
  );
}
