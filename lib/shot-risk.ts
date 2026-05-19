import { getDefaultProductionSpec } from "@/lib/genre-template";

export interface ShotRiskFlags {
  isCritical: boolean;
  missingVideo: boolean;
  imageFallbackOnly: boolean;
  criticalNeedsVideo: boolean;
}

export function evaluateShotRisk(input: {
  dramaticTag?: string | null;
  adoptedImageTakeId?: string | null;
  adoptedVideoTakeId?: string | null;
}) {
  const spec = getDefaultProductionSpec();
  const isCritical = spec.criticalDramaticTags.includes(input.dramaticTag ?? "");
  const missingVideo = !input.adoptedVideoTakeId;
  const imageFallbackOnly = !input.adoptedVideoTakeId && Boolean(input.adoptedImageTakeId);
  const criticalNeedsVideo = isCritical && imageFallbackOnly;

  return {
    isCritical,
    missingVideo,
    imageFallbackOnly,
    criticalNeedsVideo,
  } satisfies ShotRiskFlags;
}
