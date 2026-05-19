import { prisma } from "@/lib/prisma";
import { parseBlockMeta, type BlockMeta, type ShotAdoptionState, type ShotPipelineStage } from "@/lib/studio-contracts";

export type EpisodeProductionStage =
  | "idea"
  | "outline_ready"
  | "cast_locked"
  | "script_ready"
  | "breakdown_ready"
  | "production_ready";

export type ExportReadiness = "ready" | "warn" | "blocked";

const EPISODE_STAGE_ORDER: EpisodeProductionStage[] = [
  "idea",
  "outline_ready",
  "cast_locked",
  "script_ready",
  "breakdown_ready",
  "production_ready",
];

export function normalizeEpisodeStage(stage: string | null | undefined): EpisodeProductionStage {
  return EPISODE_STAGE_ORDER.includes(stage as EpisodeProductionStage)
    ? (stage as EpisodeProductionStage)
    : "idea";
}

export interface NormalizedShotState {
  adoptedImageTakeId: string | null;
  adoptedVideoTakeId: string | null;
  adoptedAudioTakeId: string | null;
  pipelineStage: ShotPipelineStage;
  exportReadiness: ExportReadiness;
  hasMotionVideo: boolean;
  fallbackMode: "none" | "image_motion" | "freeze_extend";
  blockReason: string;
  blockMeta: string;
}

function stringifyBlockMeta(blockMeta: BlockMeta | null) {
  return blockMeta ? JSON.stringify(blockMeta) : "";
}

export function deriveShotPipelineStage(adoption: ShotAdoptionState, blocked: boolean): ShotPipelineStage {
  if (blocked) return "blocked_for_review";
  if (adoption.adoptedVideoTakeId && adoption.adoptedAudioTakeId) return "ready_for_export";
  if (adoption.adoptedVideoTakeId) return "video_ready";
  if (adoption.adoptedImageTakeId) return "image_ready";
  return "draft";
}

export function normalizeShotState(input: {
  adoptedImageTakeId: string | null;
  adoptedVideoTakeId: string | null;
  adoptedAudioTakeId: string | null;
  currentBlockReason?: string | null;
  currentBlockMeta?: string | null;
  latestImageReview?: { verdict: string } | null;
  latestVideoReview?: { verdict: string; failTags?: string; details?: string } | null;
  latestAudioReview?: { verdict: string; details?: string } | null;
}): NormalizedShotState {
  const adoption = {
    adoptedImageTakeId: input.adoptedImageTakeId,
    adoptedVideoTakeId: input.adoptedVideoTakeId,
    adoptedAudioTakeId: input.adoptedAudioTakeId,
  };

  const adoptedVideoVerdict = input.latestVideoReview?.verdict ?? null;
  const adoptedAudioVerdict = input.latestAudioReview?.verdict ?? null;

  let blockReason = "";
  let blockMeta: BlockMeta | null = null;
  let exportReadiness: ExportReadiness = "ready";

  if (adoptedVideoVerdict === "fail") {
    const parsed = parseBlockMeta(input.currentBlockMeta ?? "");
    blockReason = input.currentBlockReason || "video-qa-failed";
    blockMeta =
      parsed ??
      {
        code: "video-qa-failed",
        message: input.latestVideoReview?.details || "Video QA failed and manual review is required.",
        stage: "video",
        takeId: input.adoptedVideoTakeId ?? undefined,
      };
    exportReadiness = "blocked";
  } else if (adoptedAudioVerdict === "fail") {
    blockReason = "audio-qa-failed";
    blockMeta = {
      code: "audio-qa-failed",
      message: input.latestAudioReview?.details || "Audio QA failed and manual review is required.",
      stage: "audio",
      takeId: input.adoptedAudioTakeId ?? undefined,
    };
    exportReadiness = "blocked";
  } else if (adoptedVideoVerdict === "warn" || adoptedAudioVerdict === "warn") {
    exportReadiness = "warn";
  } else if (!input.adoptedVideoTakeId && input.adoptedImageTakeId) {
    exportReadiness = "warn";
  }

  const blocked = exportReadiness === "blocked";
  const pipelineStage = deriveShotPipelineStage(adoption, blocked);

  return {
    ...adoption,
    pipelineStage,
    exportReadiness,
    hasMotionVideo: Boolean(input.adoptedVideoTakeId),
    fallbackMode: input.adoptedVideoTakeId ? "none" : input.adoptedImageTakeId ? "image_motion" : "none",
    blockReason,
    blockMeta: stringifyBlockMeta(blockMeta),
  };
}

export async function normalizeShotStateById(shotId: string) {
  const shot = await prisma.shot.findUnique({
    where: { id: shotId },
    include: {
      takes: {
        where: { isDiscarded: false },
        include: {
          reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!shot) throw new Error(`Shot ${shotId} not found`);

  const adoptedImageTake = shot.takes.find((take) => take.id === shot.adoptedImageTakeId);
  const adoptedVideoTake = shot.takes.find((take) => take.id === shot.adoptedVideoTakeId);
  const adoptedAudioTake = shot.takes.find((take) => take.id === shot.adoptedAudioTakeId);

  const normalized = normalizeShotState({
    adoptedImageTakeId: shot.adoptedImageTakeId,
    adoptedVideoTakeId: shot.adoptedVideoTakeId,
    adoptedAudioTakeId: shot.adoptedAudioTakeId,
    currentBlockReason: shot.blockReason,
    currentBlockMeta: shot.blockMeta,
    latestImageReview: adoptedImageTake?.reviews[0]
      ? { verdict: adoptedImageTake.reviews[0].verdict }
      : null,
    latestVideoReview: adoptedVideoTake?.reviews[0]
      ? {
          verdict: adoptedVideoTake.reviews[0].verdict,
          failTags: adoptedVideoTake.reviews[0].failTags,
          details: adoptedVideoTake.reviews[0].details,
        }
      : null,
    latestAudioReview: adoptedAudioTake?.reviews[0]
      ? {
          verdict: adoptedAudioTake.reviews[0].verdict,
          details: adoptedAudioTake.reviews[0].details,
        }
      : null,
  });

  return prisma.shot.update({
    where: { id: shotId },
    data: normalized,
  });
}

export function deriveEpisodeStage(input: {
  hasOutline: boolean;
  hasLead: boolean;
  hasScript: boolean;
  scriptPassed: boolean;
  hasScenes: boolean;
  hasProductionReadyShots: boolean;
}): EpisodeProductionStage {
  if (input.hasProductionReadyShots) return "production_ready";
  if (input.hasScenes) return "breakdown_ready";
  if (input.hasScript && input.scriptPassed) return "script_ready";
  if (input.hasLead) return "cast_locked";
  if (input.hasOutline) return "outline_ready";
  return "idea";
}

export async function recalculateEpisodeStage(episodeId: string) {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: {
      scriptDraft: true,
      scriptMeta: true,
      project: {
        select: {
          storyOutline: true,
          characters: { select: { id: true, isLead: true } },
        },
      },
      scenes: {
        include: {
          shots: {
            select: {
              id: true,
              adoptedImageTakeId: true,
              adoptedVideoTakeId: true,
              adoptedAudioTakeId: true,
              exportReadiness: true,
            },
          },
        },
      },
    },
  });

  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const hasOutline = Boolean(episode.project.storyOutline.trim());
  const hasLead = episode.project.characters.some((character) => character.isLead);
  const hasScript = Boolean(episode.scriptDraft.trim());
  const scriptMeta = episode.scriptMeta ? safeParseScriptMeta(episode.scriptMeta) : null;
  const scriptPassed = scriptMeta ? scriptMeta.contentBlockers.length === 0 : !hasScript ? false : true;
  const hasScenes = episode.scenes.length > 0;
  const shots = episode.scenes.flatMap((scene) => scene.shots);
  const hasProductionReadyShots =
    shots.length > 0 &&
    shots.every(
      (shot) =>
        Boolean(shot.adoptedImageTakeId) &&
        Boolean(shot.adoptedAudioTakeId) &&
        shot.exportReadiness !== "blocked"
    );

  const productionStage = deriveEpisodeStage({
    hasOutline,
    hasLead,
    hasScript,
    scriptPassed,
    hasScenes,
    hasProductionReadyShots,
  });

  return prisma.episode.update({
    where: { id: episodeId },
    data: { productionStage },
  });
}

function safeParseScriptMeta(raw: string) {
  try {
    return JSON.parse(raw) as {
      contentBlockers: Array<unknown>;
    };
  } catch {
    return null;
  }
}

export function deriveProjectProgress(episodes: Array<{ productionStage: string | null | undefined }>) {
  const order = EPISODE_STAGE_ORDER;

  if (episodes.length === 0) {
    return {
      currentStage: "idea" as EpisodeProductionStage,
      stageCounts: Object.fromEntries(order.map((stage) => [stage, 0])) as Record<EpisodeProductionStage, number>,
    };
  }

  const stageCounts = Object.fromEntries(order.map((stage) => [stage, 0])) as Record<EpisodeProductionStage, number>;
  for (const episode of episodes) {
    stageCounts[normalizeEpisodeStage(episode.productionStage)] += 1;
  }

  const currentStage =
    [...episodes]
      .map((episode) => normalizeEpisodeStage(episode.productionStage))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
      ?? "idea";

  return {
    currentStage,
    stageCounts,
  };
}
