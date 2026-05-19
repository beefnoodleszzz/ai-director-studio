export const CHARACTER_ASSET_TYPES = [
  "reference-main",
  "angle-left",
  "angle-right",
  "angle-three-quarter",
  "expression-neutral",
  "expression-angry",
  "expression-sad",
  "expression-surprised",
  "other",
] as const;

export type CharacterAssetType = (typeof CHARACTER_ASSET_TYPES)[number];

export const CHARACTER_ASSET_READY_TYPES = [
  "reference-main",
  "angle-left",
  "angle-right",
  "angle-three-quarter",
  "expression-neutral",
  "expression-angry",
  "expression-sad",
  "expression-surprised",
] as const;

export type CharacterAssetStatus = "missing" | "partial" | "ready";

export type ShotPipelineStage =
  | "draft"
  | "image_generating"
  | "image_ready"
  | "video_generating"
  | "video_ready"
  | "audio_generating"
  | "blocked_for_review"
  | "ready_for_export";

export type TaskStage = "image" | "video" | "audio" | "review" | "export" | "";

export type BlockReasonCode =
  | "missing-character-assets"
  | "image-qa-failed"
  | "video-qa-failed"
  | "audio-qa-failed"
  | "continuity-check-failed"
  | "script-content-failed"
  | "missing-dialogue-main-track"
  | "critical-shot-fallback"
  | "manual-review-required";

export interface BlockMeta {
  code: BlockReasonCode;
  message: string;
  stage: TaskStage | "character-assets";
  taskId?: string;
  shotId?: string;
  takeId?: string;
  details?: string[];
}

export interface ShotAdoptionState {
  adoptedImageTakeId: string | null;
  adoptedVideoTakeId: string | null;
  adoptedAudioTakeId: string | null;
}

export function normalizeCharacterAssetType(assetType: string): CharacterAssetType {
  switch (assetType) {
    case "reference":
      return "reference-main";
    case "angle":
      return "angle-three-quarter";
    case "expression":
      return "expression-neutral";
    case "reference-main":
    case "angle-left":
    case "angle-right":
    case "angle-three-quarter":
    case "expression-neutral":
    case "expression-angry":
    case "expression-sad":
    case "expression-surprised":
    case "other":
      return assetType;
    case "costume":
      return "other";
    default:
      return CHARACTER_ASSET_TYPES.includes(assetType as CharacterAssetType)
        ? (assetType as CharacterAssetType)
        : "other";
  }
}

export function inferCharacterAssetStatus(assetTypes: string[]): CharacterAssetStatus {
  const normalized = new Set(assetTypes.map(normalizeCharacterAssetType));
  const matched = CHARACTER_ASSET_READY_TYPES.filter((type) => normalized.has(type));
  if (matched.length === 0) return "missing";
  if (matched.length === CHARACTER_ASSET_READY_TYPES.length) return "ready";
  return "partial";
}

export function buildBlockMeta(meta: BlockMeta): string {
  return JSON.stringify(meta);
}

export function parseBlockMeta(raw: string | null | undefined): BlockMeta | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BlockMeta;
  } catch {
    return null;
  }
}
