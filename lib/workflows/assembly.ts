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
import { paths, initExportDirs } from "@/lib/asset";
import { enqueueTask } from "@/lib/task-queue";
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
}

interface ExportManifest {
  projectId: string;
  episodeId: string;
  exportType: string;
  aspect: string;
  shots: ShotManifestEntry[];
  outputPath: string;
  exportedAt: string;
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

export interface AssemblyResult {
  exportRecordId: string;
  outputPath: string;
  outputUrl: string;
  totalShots: number;
  durationSecs: number;
}

export async function assembleShortDrama(input: AssemblyInput): Promise<AssemblyResult> {
  const { projectId, episodeId, aspect = "9:16", bgmPath } = input;

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      project: true,
      scenes: {
        orderBy: { sceneOrder: "asc" },
        include: {
          shots: {
            orderBy: { shotOrder: "asc" },
            include: {
              takes: {
                where: { isAdopted: true },
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
  }[] = [];

  for (const scene of episode.scenes) {
    for (const shot of scene.shots) {
      const videoTake = shot.takes.find((t) => t.takeType === "video" && t.isAdopted);
      const imageTake = shot.takes.find((t) => t.takeType === "image" && t.isAdopted);
      const audioTake = shot.takes.find((t) => t.takeType === "audio" && t.isAdopted);
      const sfxTake = shot.takes.find((t) => t.takeType === "sfx" && t.isAdopted);

      if (!videoTake && !imageTake) continue;

      const resolvePublicPath = (url: string | null | undefined) => {
        if (!url) return null;
        return path.join(process.cwd(), "public", url.startsWith("/") ? url : `/${url}`);
      };

      const entry: ShotManifestEntry = {
        sceneOrder: scene.sceneOrder,
        shotOrder: shot.shotOrder,
        shotId: shot.id,
        takeId: videoTake?.id ?? imageTake?.id ?? "",
        localVideo: videoTake?.localVideo ?? undefined,
        localImage: imageTake?.localImage ?? undefined,
        localAudio: audioTake?.localAudio ?? undefined,
      };
      manifestEntries.push(entry);

      mediaItems.push({
        localVideo: resolvePublicPath(videoTake?.localVideo),
        localImage: resolvePublicPath(imageTake?.localImage),
        localAudio: resolvePublicPath(audioTake?.localAudio),
        localSfx: resolvePublicPath(sfxTake?.localAudio),
        localBgm: null,
      });
    }
  }

  if (mediaItems.length === 0) {
    throw new Error("No adopted takes found for assembly");
  }

  // 初始化导出目录
  initExportDirs(projectId, episodeId);
  const exportsDir = paths.exports(projectId, episodeId);
  const outputFilename = `episode_${episodeId}_${Date.now()}.mp4`;
  const outputPath = path.join(exportsDir, outputFilename);
  const outputUrl = `/workspace/projects/${projectId}/episodes/${episodeId}/exports/${outputFilename}`;

  await prisma.episode.update({ where: { id: episodeId }, data: { status: "in-progress" } });

  await assembleEpisode(mediaItems, {
    outputPath,
    bgmPath: bgmPath ? path.join(process.cwd(), "public", bgmPath) : undefined,
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
      status: "completed",
      outputPath: outputUrl,
      manifestPath: manifestUrl,
      totalShots: manifestEntries.length,
      duration: totalDuration,
      exportedAt: new Date(),
    },
  });

  await prisma.episode.update({ where: { id: episodeId }, data: { status: "completed" } });

  return {
    exportRecordId: exportRecord.id,
    outputPath,
    outputUrl,
    totalShots: manifestEntries.length,
    durationSecs: totalDuration,
  };
}

// ─── 含任务追踪的包装入口 ─────────────────────────────────────────────────────

export async function assembleWithTask(input: AssemblyInput) {
  return enqueueTask(
    {
      projectId: input.projectId,
      taskType: "assembly",
      inputRef: { episodeId: input.episodeId, aspect: input.aspect },
    },
    () => assembleShortDrama(input)
  );
}
