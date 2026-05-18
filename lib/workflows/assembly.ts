/**
 * 合成 Workflow
 *
 * 职责：
 * 1. 从 Episode 的所有 Shot 中提取采用的 Take 媒体路径
 * 2. 调用 FFmpeg 按 Shot 顺序合成成片
 * 3. 写入 ExportRecord，记录输出路径和 manifest
 * 4. 支持短剧模式（视频）和漫剧模式（长图，后续扩展）
 */

import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { assembleEpisode } from "@/lib/ffmpeg";
import { paths, initExportDirs, toAbsolutePublicPath } from "@/lib/asset";
import { enqueueTask } from "@/lib/task-queue";
import { recalculateEpisodeStage } from "@/lib/production-state";
import type { AssemblyInput } from "./types";

// ─── Manifest 结构 ────────────────────────────────────────────────────────────

interface ShotManifestEntry {
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  takeId: string;
  localVideo?: string;
  localImage?: string;
  localAudio?: string;
  fallbackMode?: "none" | "image_motion" | "freeze_extend";
  exportReadiness?: string;
}

interface ExportManifest {
  projectId: string;
  episodeId: string;
  exportType: string;
  aspect: string;
  shots: ShotManifestEntry[];
  outputPath: string;
  exportedAt: string;
  quality: {
    totalShots: number;
    motionVideoShots: number;
    imageFallbackShots: number;
    fallbackRatio: number;
    warned: boolean;
  };
  preflight: ExportPreflight;
}

interface ExportPreflightShotIssue {
  shotId: string;
  sceneId?: string;
  sceneOrder: number;
  shotOrder: number;
  code:
    | "missing-video"
    | "missing-image"
    | "missing-audio"
    | "image-fallback"
    | "resolution-too-low"
    | "shot-blocked";
  severity: "warn" | "error";
  message: string;
  details?: Record<string, unknown>;
}

interface ExportPreflight {
  ok: boolean;
  counts: {
    totalShots: number;
    readyShots: number;
    blockedShots: number;
    missingVideoShots: number;
    missingAudioShots: number;
    fallbackShots: number;
    lowResolutionShots: number;
    continuityWarnShots: number;
  };
  thresholds: {
    minWidth: number;
    minHeight: number;
  };
  bgm: {
    requested: boolean;
    resolved: boolean;
    source: string | null;
  };
  issues: ExportPreflightShotIssue[];
  continuityAudit: {
    summary: string;
    issues: Array<{
      previousShotId: string | null;
      shotId: string;
      sceneId: string;
      sceneOrder: number;
      shotOrder: number;
      severity: "warn" | "error";
      tags: string[];
      message: string;
      recommendation: string;
    }>;
  };
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

export interface AssemblyResult {
  exportRecordId: string;
  outputPath: string;
  outputUrl: string;
  totalShots: number;
  durationSecs: number;
  preflight: ExportPreflight;
  manifestUrl: string;
  bgm: ExportPreflight["bgm"];
}

export class ExportPreflightError extends Error {
  readonly preflight: ExportPreflight;

  constructor(message: string, preflight: ExportPreflight) {
    super(message);
    this.name = "ExportPreflightError";
    this.preflight = preflight;
  }
}

interface ResolvedShotMedia {
  shotId: string;
  sceneId: string;
  sceneOrder: number;
  shotOrder: number;
  shotType: string | null;
  emotionGoal: string | null;
  exportReadiness: string;
  adoptedVideoTake: {
    id: string;
    localVideo: string | null;
  } | null;
  adoptedImageTake: {
    id: string;
    localImage: string | null;
  } | null;
  adoptedAudioTake: {
    id: string;
    localAudio: string | null;
  } | null;
  adoptedSfxTake: {
    id: string;
    localAudio: string | null;
  } | null;
}

function resolvePublicPath(url: string | null | undefined) {
  return toAbsolutePublicPath(url);
}

async function probeVideoResolution(filePath: string): Promise<{ width: number; height: number } | null> {
  const ffmpeg = await import("fluent-ffmpeg");
  return new Promise((resolve) => {
    ffmpeg.default.ffprobe(filePath, (err, meta) => {
      if (err) return resolve(null);
      const stream = meta.streams?.find((item) => item.codec_type === "video");
      if (!stream?.width || !stream?.height) return resolve(null);
      resolve({ width: stream.width, height: stream.height });
    });
  });
}

async function buildPreflight(
  shots: ResolvedShotMedia[],
  options: { bgmPath?: string; minResolution?: { width: number; height: number } }
): Promise<ExportPreflight> {
  const minWidth = options.minResolution?.width ?? 720;
  const minHeight = options.minResolution?.height ?? 1280;
  const issues: ExportPreflightShotIssue[] = [];

  let readyShots = 0;
  let blockedShots = 0;
  let missingVideoShots = 0;
  let missingAudioShots = 0;
  let fallbackShots = 0;
  let lowResolutionShots = 0;
  let continuityWarnShots = 0;

  for (const shot of shots) {
    const base = {
      shotId: shot.shotId,
      sceneId: shot.sceneId,
      sceneOrder: shot.sceneOrder,
      shotOrder: shot.shotOrder,
    };
    const hasVideo = !!shot.adoptedVideoTake?.localVideo;
    const hasImage = !!shot.adoptedImageTake?.localImage;
    const hasAudio = !!shot.adoptedAudioTake?.localAudio;

    if (shot.exportReadiness === "blocked") {
      blockedShots += 1;
      issues.push({
        ...base,
        code: "shot-blocked",
        severity: "error",
        message: "镜头已被质检阻断，不能直接导出",
      });
    } else {
      readyShots += 1;
    }

    if (!hasVideo) {
      missingVideoShots += 1;
      issues.push({
        ...base,
        code: hasImage ? "image-fallback" : "missing-video",
        severity: hasImage ? "warn" : "error",
        message: hasImage ? "缺少采用视频，将退回首帧动效导出" : "缺少采用视频",
      });
      if (hasImage) fallbackShots += 1;
    }

    if (!hasVideo && !hasImage) {
      issues.push({
        ...base,
        code: "missing-image",
        severity: "error",
        message: "缺少采用首帧，无法作为视频缺失时的兜底素材",
      });
    }

    if (!hasAudio) {
      missingAudioShots += 1;
      issues.push({
        ...base,
        code: "missing-audio",
        severity: "warn",
        message: "缺少采用音频，导出将没有对白主轨",
      });
    }

    if (hasVideo) {
      const absolute = resolvePublicPath(shot.adoptedVideoTake?.localVideo);
      if (absolute && fs.existsSync(absolute)) {
        const resolution = await probeVideoResolution(absolute);
        if (resolution && (resolution.width < minWidth || resolution.height < minHeight)) {
          lowResolutionShots += 1;
          issues.push({
            ...base,
            code: "resolution-too-low",
            severity: "warn",
            message: `视频分辨率低于门槛 ${minWidth}x${minHeight}`,
            details: resolution,
          });
        }
      }
    }
  }

  const continuityIssues = buildContinuityAudit(shots);
  continuityWarnShots = continuityIssues.length;
  for (const issue of continuityIssues) {
    issues.push({
      shotId: issue.shotId,
      sceneOrder: issue.sceneOrder,
      shotOrder: issue.shotOrder,
      code: "shot-blocked",
      severity: issue.severity,
      message: issue.message,
      details: {
        previousShotId: issue.previousShotId,
        tags: issue.tags,
        recommendation: issue.recommendation,
      },
    });
  }

  const resolvedBgm = !!(options.bgmPath && fs.existsSync(options.bgmPath));
  const hasBlockingIssues = issues.some((issue) => issue.severity === "error");

  return {
    ok: !hasBlockingIssues,
    counts: {
      totalShots: shots.length,
      readyShots,
      blockedShots,
      missingVideoShots,
      missingAudioShots,
      fallbackShots,
      lowResolutionShots,
      continuityWarnShots,
    },
    thresholds: {
      minWidth,
      minHeight,
    },
    bgm: {
      requested: !!options.bgmPath,
      resolved: resolvedBgm,
      source: options.bgmPath ?? null,
    },
    issues,
    continuityAudit: {
      summary:
        continuityIssues.length > 0
          ? `检测到 ${continuityIssues.length} 个可能影响镜头丝滑衔接的问题`
          : "未发现明显镜头承接异常",
      issues: continuityIssues,
    },
  };
}

function buildContinuityAudit(shots: ResolvedShotMedia[]) {
  const issues: Array<{
    previousShotId: string | null;
    shotId: string;
    sceneId: string;
    sceneOrder: number;
    shotOrder: number;
    severity: "warn" | "error";
    tags: string[];
    message: string;
    recommendation: string;
  }> = [];

  for (let i = 1; i < shots.length; i++) {
    const previous = shots[i - 1];
    const current = shots[i];
    const tags: string[] = [];

    if (!!previous.adoptedVideoTake?.localVideo !== !!current.adoptedVideoTake?.localVideo) {
      tags.push("continuity-break");
    }

    if (previous.shotType === "ECU" && current.shotType === "ELS") {
      tags.push("continuity-break");
    }

    if (
      previous.emotionGoal &&
      current.emotionGoal &&
      previous.emotionGoal !== current.emotionGoal &&
      !current.adoptedVideoTake?.localVideo
    ) {
      tags.push("temporal-inconsistency");
    }

    if (tags.length === 0) continue;

    issues.push({
      previousShotId: previous.shotId,
      shotId: current.shotId,
      sceneId: current.sceneId,
      sceneOrder: current.sceneOrder,
      shotOrder: current.shotOrder,
      severity: tags.includes("continuity-break") ? "warn" : "warn",
      tags,
      message: "当前镜头与上一镜头的承接可能不丝滑",
      recommendation: tags.includes("continuity-break")
        ? "优先重做该镜头视频，并加强上一镜头承接参考或降低镜头跳变幅度"
        : "优先重做该镜头视频，并强化角色情绪与动作延续约束",
    });
  }

  return issues;
}

export async function assembleShortDrama(input: AssemblyInput): Promise<AssemblyResult> {
  const { projectId, episodeId, aspect = "9:16", bgmPath } = input;
  const bgmAbsolutePath = bgmPath ? resolvePublicPath(bgmPath) : null;

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      project: true,
      scenes: {
        orderBy: { sceneOrder: "asc" },
        select: {
          id: true,
          sceneOrder: true,
          shots: {
            orderBy: { shotOrder: "asc" },
            select: {
              id: true,
              shotOrder: true,
              shotType: true,
              emotionGoal: true,
              exportReadiness: true,
              adoptedImageTakeId: true,
              adoptedVideoTakeId: true,
              adoptedAudioTakeId: true,
              takes: {
                select: {
                  id: true,
                  takeType: true,
                  isAdopted: true,
                  localImage: true,
                  localVideo: true,
                  localAudio: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const manifestEntries: ShotManifestEntry[] = [];
  const mediaItems: {
    localVideo: string | null;
    localImage: string | null;
    localAudio: string | null;
    localSfx: string | null;
    localBgm: string | null;
    shotType: string | null;
    emotionGoal: string | null;
  }[] = [];
  const resolvedShots: ResolvedShotMedia[] = [];
  let motionVideoShots = 0;
  let imageFallbackShots = 0;

  for (const scene of episode.scenes) {
    for (const shot of scene.shots) {
      const videoTake = shot.takes.find(
        (t) => t.id === shot.adoptedVideoTakeId || (!shot.adoptedVideoTakeId && t.takeType === "video" && t.isAdopted)
      );
      const imageTake = shot.takes.find(
        (t) => t.id === shot.adoptedImageTakeId || (!shot.adoptedImageTakeId && t.takeType === "image" && t.isAdopted)
      );
      const audioTake = shot.takes.find(
        (t) => t.id === shot.adoptedAudioTakeId || (!shot.adoptedAudioTakeId && t.takeType === "audio" && t.isAdopted)
      );
      const sfxTake = shot.takes.find((t) => t.takeType === "sfx" && t.isAdopted);

      resolvedShots.push({
        shotId: shot.id,
        sceneId: scene.id,
        sceneOrder: scene.sceneOrder,
        shotOrder: shot.shotOrder,
        shotType: shot.shotType,
        emotionGoal: shot.emotionGoal,
        exportReadiness: shot.exportReadiness,
        adoptedVideoTake: videoTake ? { id: videoTake.id, localVideo: videoTake.localVideo } : null,
        adoptedImageTake: imageTake ? { id: imageTake.id, localImage: imageTake.localImage } : null,
        adoptedAudioTake: audioTake ? { id: audioTake.id, localAudio: audioTake.localAudio } : null,
        adoptedSfxTake: sfxTake ? { id: sfxTake.id, localAudio: sfxTake.localAudio } : null,
      });

      if (!videoTake && !imageTake) continue;

      const entry: ShotManifestEntry = {
        sceneOrder: scene.sceneOrder,
        shotOrder: shot.shotOrder,
        shotId: shot.id,
        takeId: videoTake?.id ?? imageTake?.id ?? "",
        localVideo: videoTake?.localVideo ?? undefined,
        localImage: imageTake?.localImage ?? undefined,
        localAudio: audioTake?.localAudio ?? undefined,
        fallbackMode: videoTake ? "none" : "image_motion",
        exportReadiness: shot.exportReadiness,
      };
      manifestEntries.push(entry);
      if (videoTake?.localVideo) motionVideoShots += 1;
      else if (imageTake?.localImage) imageFallbackShots += 1;

      mediaItems.push({
        localVideo: resolvePublicPath(videoTake?.localVideo),
        localImage: resolvePublicPath(imageTake?.localImage),
        localAudio: resolvePublicPath(audioTake?.localAudio),
        localSfx: resolvePublicPath(sfxTake?.localAudio),
        localBgm: bgmAbsolutePath,
        shotType: shot.shotType,
        emotionGoal: shot.emotionGoal,
      });
    }
  }

  const preflight = await buildPreflight(resolvedShots, {
    bgmPath: bgmAbsolutePath ?? undefined,
    minResolution: input.minResolution,
  });

  if (mediaItems.length === 0) {
    throw new Error("No adopted takes found for assembly");
  }

  if (!preflight.ok) {
    const blockingMessages = preflight.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `S${issue.sceneOrder}-#${issue.shotOrder}: ${issue.message}`)
      .slice(0, 5);
    throw new ExportPreflightError(
      `Export blocked by preflight: ${blockingMessages.join(" | ") || "unknown blocking issues"}`,
      preflight
    );
  }

  // 初始化导出目录
  initExportDirs(projectId, episodeId);
  const exportsDir = paths.exports(projectId, episodeId);
  const outputFilename = `episode_${episodeId}_${Date.now()}.mp4`;
  const outputPath = path.join(exportsDir, outputFilename);
  const outputUrl = `/workspace/projects/${projectId}/episodes/${episodeId}/exports/${outputFilename}`;

  await assembleEpisode(mediaItems, {
    outputPath,
    bgmPath: bgmAbsolutePath ?? undefined,
    aspect: aspect as "16:9" | "9:16",
  });

  // 写 manifest
  const manifest: ExportManifest = {
    projectId,
    episodeId,
    exportType: "short-drama",
    aspect,
    shots: manifestEntries,
    outputPath: outputUrl,
    exportedAt: new Date().toISOString(),
    quality: {
      totalShots: manifestEntries.length,
      motionVideoShots,
      imageFallbackShots,
      fallbackRatio: manifestEntries.length > 0
        ? Math.round((imageFallbackShots / manifestEntries.length) * 100)
        : 0,
      warned: manifestEntries.length > 0
        ? imageFallbackShots / manifestEntries.length >= 0.3
        : false,
    },
    preflight,
  };
  const manifestPath = path.join(exportsDir, `manifest_${Date.now()}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const manifestUrl = `/workspace/projects/${projectId}/episodes/${episodeId}/exports/${path.basename(manifestPath)}`;

  // 计算时长（粗估）
  const totalDuration = manifestEntries.length * 5;

  const exportRecord = await prisma.exportRecord.create({
    data: {
      projectId,
      episodeId,
      exportType: "short-drama",
      outputPath: outputUrl,
      manifestPath: manifestUrl,
      totalShots: manifestEntries.length,
      duration: totalDuration,
      exportedAt: new Date(),
      errorReason: manifest.quality.warned
        ? `静态回退镜头 ${manifest.quality.imageFallbackShots}/${manifest.quality.totalShots}，成片可能有幻灯片感`
        : "",
    },
  });

  await recalculateEpisodeStage(episodeId);

  return {
    exportRecordId: exportRecord.id,
    outputPath,
    outputUrl,
    totalShots: manifestEntries.length,
    durationSecs: totalDuration,
    preflight,
    manifestUrl,
    bgm: preflight.bgm,
  };
}

export async function previewShortDramaExport(input: AssemblyInput) {
  const { projectId, episodeId, bgmPath } = input;
  const bgmAbsolutePath = bgmPath ? resolvePublicPath(bgmPath) : null;

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      scenes: {
        orderBy: { sceneOrder: "asc" },
        select: {
          id: true,
          sceneOrder: true,
          shots: {
            orderBy: { shotOrder: "asc" },
            select: {
              id: true,
              shotOrder: true,
              shotType: true,
              emotionGoal: true,
              exportReadiness: true,
              adoptedImageTakeId: true,
              adoptedVideoTakeId: true,
              adoptedAudioTakeId: true,
              takes: {
                select: {
                  id: true,
                  takeType: true,
                  isAdopted: true,
                  localImage: true,
                  localVideo: true,
                  localAudio: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const resolvedShots: ResolvedShotMedia[] = [];
  for (const scene of episode.scenes) {
    for (const shot of scene.shots) {
      const videoTake = shot.takes.find(
        (t) => t.id === shot.adoptedVideoTakeId || (!shot.adoptedVideoTakeId && t.takeType === "video" && t.isAdopted)
      );
      const imageTake = shot.takes.find(
        (t) => t.id === shot.adoptedImageTakeId || (!shot.adoptedImageTakeId && t.takeType === "image" && t.isAdopted)
      );
      const audioTake = shot.takes.find(
        (t) => t.id === shot.adoptedAudioTakeId || (!shot.adoptedAudioTakeId && t.takeType === "audio" && t.isAdopted)
      );
      const sfxTake = shot.takes.find((t) => t.takeType === "sfx" && t.isAdopted);

      resolvedShots.push({
        shotId: shot.id,
        sceneId: scene.id,
        sceneOrder: scene.sceneOrder,
        shotOrder: shot.shotOrder,
        shotType: shot.shotType,
        emotionGoal: shot.emotionGoal,
        exportReadiness: shot.exportReadiness,
        adoptedVideoTake: videoTake ? { id: videoTake.id, localVideo: videoTake.localVideo } : null,
        adoptedImageTake: imageTake ? { id: imageTake.id, localImage: imageTake.localImage } : null,
        adoptedAudioTake: audioTake ? { id: audioTake.id, localAudio: audioTake.localAudio } : null,
        adoptedSfxTake: sfxTake ? { id: sfxTake.id, localAudio: sfxTake.localAudio } : null,
      });
    }
  }

  const preflight = await buildPreflight(resolvedShots, {
    bgmPath: bgmAbsolutePath ?? undefined,
    minResolution: input.minResolution,
  });

  return {
    ok: preflight.ok,
    projectId,
    episodeId,
    totalShots: resolvedShots.length,
    preflight,
  };
}

// ─── 含任务追踪的包装入口 ─────────────────────────────────────────────────────

export async function assembleWithTask(input: AssemblyInput) {
  return enqueueTask(
    {
      projectId: input.projectId,
      taskType: "assembly",
      taskStage: "export",
      inputRef: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        aspect: input.aspect,
        bgmPath: input.bgmPath,
        minResolution: input.minResolution,
        outputType: "export",
        stage: "export",
      },
    },
    () => assembleShortDrama(input)
  );
}
