import sharp from "sharp";
import { NextResponse } from "next/server";
import type { ScriptBreakdownResult } from "@/lib/workflows/types";
import { CHARACTER_ASSET_TYPES } from "@/lib/studio-contracts";

const MAX_CHARACTER_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_CHARACTER_ASSET_DIMENSION = 4096;

const ALLOWED_CHARACTER_ASSET_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const ALLOWED_CHARACTER_ASSET_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PROJECT_TYPES = ["short-drama", "manga-drama"] as const;
const ASPECTS = ["16:9", "9:16"] as const;
const SCRIPT_SOURCES = ["generated-script", "manual-script"] as const;
const EPISODE_SCRIPT_SOURCES = ["manual", "generated"] as const;
const REVIEW_VERDICTS = ["pass", "warn", "fail"] as const;
const REVIEW_SUGGESTIONS = ["adopt", "accept-minor", "must-redo", "change-provider"] as const;
const TAKE_TYPES = ["image", "video", "audio", "sfx", "bgm"] as const;
const EPISODE_PRODUCTION_STAGES = [
  "idea",
  "outline_ready",
  "cast_locked",
  "script_ready",
  "breakdown_ready",
  "production_ready",
] as const;
const ALLOWED_PROJECT_TYPES = new Set<(typeof PROJECT_TYPES)[number]>(PROJECT_TYPES);
const ALLOWED_ASPECTS = new Set<(typeof ASPECTS)[number]>(ASPECTS);
const ALLOWED_SCRIPT_SOURCES = new Set<(typeof SCRIPT_SOURCES)[number]>(SCRIPT_SOURCES);
const ALLOWED_EPISODE_SCRIPT_SOURCES = new Set<(typeof EPISODE_SCRIPT_SOURCES)[number]>(EPISODE_SCRIPT_SOURCES);
const ALLOWED_REVIEW_VERDICTS = new Set<(typeof REVIEW_VERDICTS)[number]>(REVIEW_VERDICTS);
const ALLOWED_REVIEW_SUGGESTIONS = new Set<(typeof REVIEW_SUGGESTIONS)[number]>(REVIEW_SUGGESTIONS);
const ALLOWED_TAKE_TYPES = new Set<(typeof TAKE_TYPES)[number]>(TAKE_TYPES);
const ALLOWED_EPISODE_PRODUCTION_STAGES = new Set<(typeof EPISODE_PRODUCTION_STAGES)[number]>(EPISODE_PRODUCTION_STAGES);

type ValidationSuccess<T> = {
  ok: true;
  value: T;
};

type ValidationFailure = {
  ok: false;
  response: NextResponse;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      code,
      message,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(
  source: Record<string, unknown>,
  key: string
): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string
): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalStringArray(
  source: Record<string, unknown>,
  key: string
): string[] | undefined | null {
  const value = source[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length === value.length ? normalized : null;
}

function readOptionalEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: Set<T>
): T | undefined | null {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  return allowed.has(value as T) ? (value as T) : null;
}

function readOptionalBoolean(
  source: Record<string, unknown>,
  key: string
): boolean | undefined | null {
  const value = source[key];
  if (value === undefined) return undefined;
  return typeof value === "boolean" ? value : null;
}

function readOptionalInteger(
  source: Record<string, unknown>,
  key: string,
  options: { min: number; max: number }
): number | undefined | null {
  const value = source[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) return null;
  if ((value as number) < options.min || (value as number) > options.max) return null;
  return value as number;
}

function readOptionalNumber(
  source: Record<string, unknown>,
  key: string,
  options?: { min?: number; max?: number }
): number | undefined | null {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (options?.min !== undefined && value < options.min) return null;
  if (options?.max !== undefined && value > options.max) return null;
  return value;
}

function readOptionalObject(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined | null {
  const value = source[key];
  if (value === undefined) return undefined;
  return isPlainObject(value) ? value : null;
}

function readOptionalQueryString(
  searchParams: URLSearchParams,
  key: string
): string | undefined {
  const value = searchParams.get(key);
  return value === null || value.trim().length === 0 ? undefined : value.trim();
}

function readOptionalQueryBoolean(
  searchParams: URLSearchParams,
  key: string
): boolean | undefined | null {
  const value = searchParams.get(key);
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function readOptionalResolution(
  source: Record<string, unknown>,
  key: string
): { width: number; height: number } | undefined | null {
  const value = readOptionalObject(source, key);
  if (value === undefined) return undefined;
  if (value === null) return null;

  const width = readOptionalInteger(value, "width", { min: 64, max: 8192 });
  const height = readOptionalInteger(value, "height", { min: 64, max: 8192 });
  if (width === null || height === null || width === undefined || height === undefined) {
    return null;
  }

  return { width, height };
}

export interface ImageGenerationRequestBody {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  prompt?: string;
  refImageUrls?: string[];
  provider?: string;
  candidateCount?: number;
}

export interface VideoGenerationRequestBody {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  adoptedImageTakeId: string;
  visualPrompt?: string;
  provider?: string;
  stopOnQaFail?: boolean;
}

export interface AudioGenerationRequestBody {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  dialogue: string;
  audioPrompt?: string;
  voiceId?: string;
  provider?: string;
}

export interface SfxGenerationRequestBody {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  sfxPrompt: string;
}

export interface TaskRetryRequestBody {
  taskId: string;
}

export interface AssembleRequestBody {
  projectId: string;
  episodeId: string;
  aspect?: (typeof ASPECTS)[number];
  bgmPath?: string;
  previewOnly?: boolean;
  minResolution?: {
    width: number;
    height: number;
  };
}

export interface ScriptBreakdownRequestBody {
  episodeId: string;
  projectId: string;
  script?: string;
  source?: (typeof SCRIPT_SOURCES)[number];
  pendingData?: ScriptBreakdownResult;
}

export interface BatchImageGenerationRequestBody {
  shotIds?: string[];
  onlyFailed?: boolean;
  provider?: string;
  candidateCount?: number;
}

export interface BatchRetryRequestBody {
  takeIds: string[];
  provider?: string;
}

export interface TaskStatusQueryParams {
  taskId?: string;
  projectId?: string;
}

export interface TaskStatusDeleteQueryParams {
  taskId: string;
  hardDelete: boolean;
  deleteOutput: boolean;
}

export interface ProjectRecommendProviderQueryParams {
  takeType: string;
  fallback: string;
}

export interface ProjectExportsDeleteQueryParams {
  exportId: string;
  deleteFiles: boolean;
}

export interface ProjectQaQueryParams {
  episodeId?: string;
}

export function parseTaskStatusQueryParams(url: string): ValidationResult<TaskStatusQueryParams> {
  const searchParams = new URL(url).searchParams;
  const taskId = readOptionalQueryString(searchParams, "taskId");
  const projectId = readOptionalQueryString(searchParams, "projectId");

  return {
    ok: true,
    value: {
      ...(taskId !== undefined ? { taskId } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
    },
  };
}

export function parseTaskStatusDeleteQueryParams(url: string): ValidationResult<TaskStatusDeleteQueryParams> {
  const searchParams = new URL(url).searchParams;
  const taskId = readOptionalQueryString(searchParams, "taskId");
  if (!taskId) {
    return {
      ok: false,
      response: jsonError(400, "missing_task_id", "taskId required"),
    };
  }

  const hardDelete = readOptionalQueryBoolean(searchParams, "hardDelete");
  const deleteOutput = readOptionalQueryBoolean(searchParams, "deleteOutput");

  if (hardDelete === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_hard_delete", "hardDelete must be true or false"),
    };
  }

  if (deleteOutput === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_delete_output", "deleteOutput must be true or false"),
    };
  }

  return {
    ok: true,
    value: {
      taskId,
      hardDelete: hardDelete ?? false,
      deleteOutput: deleteOutput ?? false,
    },
  };
}

export function parseProjectRecommendProviderQueryParams(
  url: string
): ValidationResult<ProjectRecommendProviderQueryParams> {
  const searchParams = new URL(url).searchParams;
  return {
    ok: true,
    value: {
      takeType: readOptionalQueryString(searchParams, "takeType") ?? "image",
      fallback: readOptionalQueryString(searchParams, "fallback") ?? "sakura",
    },
  };
}

export function parseProjectExportsDeleteQueryParams(
  url: string
): ValidationResult<ProjectExportsDeleteQueryParams> {
  const searchParams = new URL(url).searchParams;
  const exportId = readOptionalQueryString(searchParams, "exportId");
  if (!exportId) {
    return {
      ok: false,
      response: jsonError(400, "missing_export_id", "exportId required"),
    };
  }

  const deleteFiles = readOptionalQueryBoolean(searchParams, "deleteFiles");
  if (deleteFiles === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_delete_files", "deleteFiles must be true or false"),
    };
  }

  return {
    ok: true,
    value: {
      exportId,
      deleteFiles: deleteFiles ?? false,
    },
  };
}

export function parseProjectQaQueryParams(url: string): ValidationResult<ProjectQaQueryParams> {
  const searchParams = new URL(url).searchParams;
  const episodeId = readOptionalQueryString(searchParams, "episodeId");

  return {
    ok: true,
    value: {
      ...(episodeId !== undefined ? { episodeId } : {}),
    },
  };
}

export interface EpisodeCreateRequestBody {
  episodeNum?: number;
  title?: string;
  summary?: string;
}

export interface CharacterAssetGenerationRequestBody {
  assetTypes?: string[];
  limit?: number;
}

export interface ShotRedoRequestBody {
  strategyHint?: string;
  reasonTags?: string[];
}

export interface StyleBibleUpsertRequestBody {
  genreTag?: string;
  visualStyle?: string;
  colorStrategy?: string;
  shotPreference?: string;
  imageDensity?: string;
  eraAesthetic?: string;
  setConstraints?: string;
  propConstraints?: string;
  negativeKeywords?: string;
  mangaLayoutStyle?: string;
}

export interface CastPatchRequestBody {
  leadCharacterId?: string;
  characters?: Array<{
    id: string;
    role?: string;
    dramaticGoal?: string;
    conflictRole?: string;
    relationshipSummary?: string;
    arcSummary?: string;
    basePrompt?: string;
    isLead?: boolean;
  }>;
}

export interface CastLockRequestBody {
  leadCharacterId: string;
}

export interface OutlinePatchRequestBody {
  storyOutline: Record<string, unknown> | unknown[];
}

export interface ProjectCreateRequestBody {
  title: string;
  type?: (typeof PROJECT_TYPES)[number];
  aspect?: (typeof ASPECTS)[number];
  worldSetting?: string;
  era?: string;
}

export interface ProjectUpdateRequestBody {
  title?: string;
  type?: (typeof PROJECT_TYPES)[number];
  aspect?: (typeof ASPECTS)[number];
  worldSetting?: string;
  era?: string;
}

export interface CharacterPatchRequestBody {
  name?: string;
  aliases?: string;
  gender?: string;
  ageRange?: string;
  role?: string;
  facialFeatures?: string;
  hairstyle?: string;
  bodyType?: string;
  wardrobeBase?: string;
  temperamentTags?: string;
  typicalExpressions?: string;
  typicalActions?: string;
  anchorFace?: string;
  anchorHair?: string;
  anchorWardrobe?: string;
  wardrobeVariants?: string;
  emotionRange?: string;
  sceneOutfits?: string;
  relationships?: string;
  basePrompt?: string;
  isLead?: boolean;
  dramaticGoal?: string;
  conflictRole?: string;
  relationshipSummary?: string;
  arcSummary?: string;
  voiceProfile?: {
    voiceType?: string;
    ageFeeling?: string;
    emotionStyle?: string;
    speechRate?: string;
    pauseStyle?: string;
    volume?: number;
    languageStyle?: string;
    provider?: string;
    voiceId?: string;
    extraParams?: string;
  };
}

export interface EpisodeUpdateRequestBody {
  title?: string;
  summary?: string;
  hook?: string;
  cliffhanger?: string;
  prevLink?: string;
  scriptDraft?: string;
  scriptMeta?: string;
  scriptSource?: (typeof EPISODE_SCRIPT_SOURCES)[number];
  productionStage?: (typeof EPISODE_PRODUCTION_STAGES)[number];
}

export interface EpisodeScriptPatchRequestBody {
  scriptDraft?: string;
  scriptMeta?: string;
  title?: string;
  summary?: string;
  hook?: string;
  cliffhanger?: string;
  scriptSource?: (typeof EPISODE_SCRIPT_SOURCES)[number];
}

export interface CharacterCreateRequestBody extends CharacterPatchRequestBody {
  name: string;
}

export interface QaReviewPatchRequestBody {
  reviewId: string;
  verdict?: (typeof REVIEW_VERDICTS)[number];
  suggestion?: (typeof REVIEW_SUGGESTIONS)[number];
  details?: string;
}

export interface ShotPatchRequestBody {
  autoContinue?: boolean;
  clearBlock?: boolean;
}

export interface TakePatchRequestBody {
  isDiscarded?: boolean;
  discardReason?: string;
}

export interface ShotAdoptRequestBody {
  takeId: string;
  takeType?: (typeof TAKE_TYPES)[number];
}

export interface ShotDialoguePatchRequestBody {
  dialogue?: string;
  audioPrompt?: string;
  sentenceIndex?: number;
  newSentenceText?: string;
}

export function validateImageGenerationBody(body: unknown): ValidationResult<ImageGenerationRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const projectId = readNonEmptyString(body, "projectId");
  const episodeId = readNonEmptyString(body, "episodeId");
  const sceneId = readNonEmptyString(body, "sceneId");
  const shotId = readNonEmptyString(body, "shotId");
  const prompt = readOptionalString(body, "prompt");
  const provider = readOptionalString(body, "provider");
  const refImageUrls = readOptionalStringArray(body, "refImageUrls");
  const candidateCount = readOptionalInteger(body, "candidateCount", { min: 1, max: 4 });

  if (!projectId || !episodeId || !sceneId || !shotId) {
    return {
      ok: false,
      response: jsonError(400, "missing_fields", "projectId, episodeId, sceneId, shotId are required"),
    };
  }

  if (refImageUrls === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_ref_image_urls", "refImageUrls must be an array of strings"),
    };
  }

  if (candidateCount === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_candidate_count", "candidateCount must be an integer between 1 and 4"),
    };
  }

  return {
    ok: true,
    value: {
      projectId,
      episodeId,
      sceneId,
      shotId,
      ...(prompt !== undefined ? { prompt } : {}),
      ...(provider !== undefined ? { provider } : {}),
      ...(refImageUrls !== undefined ? { refImageUrls } : {}),
      ...(candidateCount !== undefined ? { candidateCount } : {}),
    },
  };
}

export function validateVideoGenerationBody(body: unknown): ValidationResult<VideoGenerationRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const projectId = readNonEmptyString(body, "projectId");
  const episodeId = readNonEmptyString(body, "episodeId");
  const sceneId = readNonEmptyString(body, "sceneId");
  const shotId = readNonEmptyString(body, "shotId");
  const adoptedImageTakeId = readNonEmptyString(body, "adoptedImageTakeId");
  const visualPrompt = readOptionalString(body, "visualPrompt");
  const provider = readOptionalString(body, "provider");
  const stopOnQaFail = readOptionalBoolean(body, "stopOnQaFail");

  if (!projectId || !episodeId || !sceneId || !shotId || !adoptedImageTakeId) {
    return {
      ok: false,
      response: jsonError(
        400,
        "missing_fields",
        "projectId, episodeId, sceneId, shotId, adoptedImageTakeId are required"
      ),
    };
  }

  if (stopOnQaFail === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_stop_on_qa_fail", "stopOnQaFail must be a boolean"),
    };
  }

  return {
    ok: true,
    value: {
      projectId,
      episodeId,
      sceneId,
      shotId,
      adoptedImageTakeId,
      ...(visualPrompt !== undefined ? { visualPrompt } : {}),
      ...(provider !== undefined ? { provider } : {}),
      ...(stopOnQaFail !== undefined ? { stopOnQaFail } : {}),
    },
  };
}

export function validateAudioGenerationBody(body: unknown): ValidationResult<AudioGenerationRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const projectId = readNonEmptyString(body, "projectId");
  const episodeId = readNonEmptyString(body, "episodeId");
  const sceneId = readNonEmptyString(body, "sceneId");
  const shotId = readNonEmptyString(body, "shotId");
  const dialogue = readNonEmptyString(body, "dialogue");
  const audioPrompt = readOptionalString(body, "audioPrompt");
  const voiceId = readOptionalString(body, "voiceId");
  const provider = readOptionalString(body, "provider");

  if (!projectId || !episodeId || !sceneId || !shotId || !dialogue) {
    return {
      ok: false,
      response: jsonError(
        400,
        "missing_fields",
        "projectId, episodeId, sceneId, shotId, dialogue are required"
      ),
    };
  }

  return {
    ok: true,
    value: {
      projectId,
      episodeId,
      sceneId,
      shotId,
      dialogue,
      ...(audioPrompt !== undefined ? { audioPrompt } : {}),
      ...(voiceId !== undefined ? { voiceId } : {}),
      ...(provider !== undefined ? { provider } : {}),
    },
  };
}

export function validateSfxGenerationBody(body: unknown): ValidationResult<SfxGenerationRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const projectId = readNonEmptyString(body, "projectId");
  const episodeId = readNonEmptyString(body, "episodeId");
  const sceneId = readNonEmptyString(body, "sceneId");
  const shotId = readNonEmptyString(body, "shotId");
  const sfxPrompt = readNonEmptyString(body, "sfxPrompt");

  if (!projectId || !episodeId || !sceneId || !shotId || !sfxPrompt) {
    return {
      ok: false,
      response: jsonError(
        400,
        "missing_fields",
        "projectId, episodeId, sceneId, shotId, sfxPrompt are required"
      ),
    };
  }

  return {
    ok: true,
    value: {
      projectId,
      episodeId,
      sceneId,
      shotId,
      sfxPrompt,
    },
  };
}

export function validateTaskRetryBody(body: unknown): ValidationResult<TaskRetryRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const taskId = readNonEmptyString(body, "taskId");
  if (!taskId) {
    return {
      ok: false,
      response: jsonError(400, "missing_task_id", "taskId is required"),
    };
  }

  return {
    ok: true,
    value: { taskId },
  };
}

export function validateAssembleBody(body: unknown): ValidationResult<AssembleRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const projectId = readNonEmptyString(body, "projectId");
  const episodeId = readNonEmptyString(body, "episodeId");
  const aspect = readOptionalEnum(body, "aspect", ALLOWED_ASPECTS);
  const bgmPath = readOptionalString(body, "bgmPath");
  const previewOnly = readOptionalBoolean(body, "previewOnly");
  const minResolution = readOptionalResolution(body, "minResolution");

  if (!projectId || !episodeId) {
    return {
      ok: false,
      response: jsonError(400, "missing_fields", "projectId and episodeId are required"),
    };
  }

  if (aspect === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_aspect", "aspect must be either 16:9 or 9:16"),
    };
  }

  if (previewOnly === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_preview_only", "previewOnly must be a boolean"),
    };
  }

  if (minResolution === null) {
    return {
      ok: false,
      response: jsonError(
        400,
        "invalid_min_resolution",
        "minResolution must include integer width and height between 64 and 8192"
      ),
    };
  }

  return {
    ok: true,
    value: {
      projectId,
      episodeId,
      ...(aspect !== undefined ? { aspect } : {}),
      ...(bgmPath !== undefined ? { bgmPath } : {}),
      ...(previewOnly !== undefined ? { previewOnly } : {}),
      ...(minResolution !== undefined ? { minResolution } : {}),
    },
  };
}

export function validateScriptBreakdownBody(body: unknown): ValidationResult<ScriptBreakdownRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const episodeId = readNonEmptyString(body, "episodeId");
  const projectId = readNonEmptyString(body, "projectId");
  const script = readOptionalString(body, "script");
  const source = readOptionalEnum(body, "source", ALLOWED_SCRIPT_SOURCES);
  const pendingData = readOptionalObject(body, "pendingData");

  if (!episodeId || !projectId) {
    return {
      ok: false,
      response: jsonError(400, "missing_fields", "episodeId and projectId are required"),
    };
  }

  if (source === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_source", "source must be generated-script or manual-script"),
    };
  }

  if (pendingData === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_pending_data", "pendingData must be a JSON object"),
    };
  }

  if (!pendingData && !script?.trim()) {
    return {
      ok: false,
      response: jsonError(400, "missing_script", "script is required when pendingData is not provided"),
    };
  }

  return {
    ok: true,
    value: {
      episodeId,
      projectId,
      ...(script !== undefined ? { script } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(pendingData !== undefined ? { pendingData: pendingData as unknown as ScriptBreakdownResult } : {}),
    },
  };
}

export function validateBatchImageGenerationBody(body: unknown): ValidationResult<BatchImageGenerationRequestBody> {
  if (body == null) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const shotIds = readOptionalStringArray(body, "shotIds");
  const onlyFailed = readOptionalBoolean(body, "onlyFailed");
  const provider = readOptionalString(body, "provider");
  const candidateCount = readOptionalInteger(body, "candidateCount", { min: 1, max: 4 });
  const legacyCandidateCount = readOptionalInteger(body, "nCandidates", { min: 1, max: 4 });

  if (shotIds === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_shot_ids", "shotIds must be an array of strings"),
    };
  }

  if (onlyFailed === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_only_failed", "onlyFailed must be a boolean"),
    };
  }

  if (candidateCount === null || legacyCandidateCount === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_candidate_count", "candidateCount must be an integer between 1 and 4"),
    };
  }

  if (
    candidateCount !== undefined &&
    legacyCandidateCount !== undefined &&
    candidateCount !== legacyCandidateCount
  ) {
    return {
      ok: false,
      response: jsonError(
        400,
        "conflicting_candidate_count",
        "candidateCount and nCandidates must match when both are provided"
      ),
    };
  }

  return {
    ok: true,
    value: {
      ...(shotIds !== undefined ? { shotIds } : {}),
      ...(onlyFailed !== undefined ? { onlyFailed } : {}),
      ...(provider !== undefined ? { provider } : {}),
      ...(candidateCount ?? legacyCandidateCount ? { candidateCount: candidateCount ?? legacyCandidateCount } : {}),
    },
  };
}

export function validateBatchRetryBody(body: unknown): ValidationResult<BatchRetryRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const takeIds = readOptionalStringArray(body, "takeIds");
  const provider = readOptionalString(body, "provider");

  if (takeIds === null || !takeIds?.length) {
    return {
      ok: false,
      response: jsonError(400, "invalid_take_ids", "takeIds must be a non-empty array of strings"),
    };
  }

  return {
    ok: true,
    value: {
      takeIds,
      ...(provider !== undefined ? { provider } : {}),
    },
  };
}

export function validateProjectCreateBody(body: unknown): ValidationResult<ProjectCreateRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const title = readNonEmptyString(body, "title");
  const type = readOptionalEnum(body, "type", ALLOWED_PROJECT_TYPES);
  const aspect = readOptionalEnum(body, "aspect", ALLOWED_ASPECTS);
  const worldSetting = readOptionalString(body, "worldSetting");
  const era = readOptionalString(body, "era");

  if (!title) {
    return {
      ok: false,
      response: jsonError(400, "missing_title", "title is required"),
    };
  }

  if (type === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_type", "type must be short-drama or manga-drama"),
    };
  }

  if (aspect === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_aspect", "aspect must be either 16:9 or 9:16"),
    };
  }

  return {
    ok: true,
    value: {
      title,
      ...(type !== undefined ? { type } : {}),
      ...(aspect !== undefined ? { aspect } : {}),
      ...(worldSetting !== undefined ? { worldSetting } : {}),
      ...(era !== undefined ? { era } : {}),
    },
  };
}

export function validateEpisodeCreateBody(body: unknown): ValidationResult<EpisodeCreateRequestBody> {
  if (body == null) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const episodeNum = readOptionalInteger(body, "episodeNum", { min: 1, max: 9999 });
  const title = readOptionalString(body, "title");
  const summary = readOptionalString(body, "summary");

  if (episodeNum === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_episode_num", "episodeNum must be an integer between 1 and 9999"),
    };
  }

  return {
    ok: true,
    value: {
      ...(episodeNum !== undefined ? { episodeNum } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(summary !== undefined ? { summary } : {}),
    },
  };
}

export function validateCharacterAssetGenerationBody(
  body: unknown
): ValidationResult<CharacterAssetGenerationRequestBody> {
  if (body == null) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const assetTypes = readOptionalStringArray(body, "assetTypes");
  const limit = readOptionalInteger(body, "limit", { min: 1, max: CHARACTER_ASSET_TYPES.length });

  if (assetTypes === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_asset_types", "assetTypes must be an array of strings"),
    };
  }

  if (limit === null) {
    return {
      ok: false,
      response: jsonError(
        400,
        "invalid_limit",
        `limit must be an integer between 1 and ${CHARACTER_ASSET_TYPES.length}`
      ),
    };
  }

  return {
    ok: true,
    value: {
      ...(assetTypes !== undefined ? { assetTypes } : {}),
      ...(limit !== undefined ? { limit } : {}),
    },
  };
}

export function validateShotRedoBody(body: unknown): ValidationResult<ShotRedoRequestBody> {
  if (body == null) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const strategyHint = readOptionalString(body, "strategyHint");
  const reasonTags = readOptionalStringArray(body, "reasonTags");

  if (reasonTags === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_reason_tags", "reasonTags must be an array of strings"),
    };
  }

  return {
    ok: true,
    value: {
      ...(strategyHint !== undefined ? { strategyHint } : {}),
      ...(reasonTags !== undefined ? { reasonTags } : {}),
    },
  };
}

export function validateStyleBibleUpsertBody(
  body: unknown
): ValidationResult<StyleBibleUpsertRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const stringFields = [
    "genreTag",
    "visualStyle",
    "colorStrategy",
    "shotPreference",
    "imageDensity",
    "eraAesthetic",
    "setConstraints",
    "propConstraints",
    "negativeKeywords",
    "mangaLayoutStyle",
  ] as const;

  const value: StyleBibleUpsertRequestBody = {};
  for (const field of stringFields) {
    const next = body[field];
    if (next === undefined) continue;
    if (typeof next !== "string") {
      return {
        ok: false,
        response: jsonError(400, "invalid_style_bible_field", `${field} must be a string`),
      };
    }
    value[field] = next;
  }

  return { ok: true, value };
}

export function validateCastPatchBody(body: unknown): ValidationResult<CastPatchRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const leadCharacterId = readNonEmptyString(body, "leadCharacterId") ?? undefined;
  const charactersRaw = body.characters;
  let characters: CastPatchRequestBody["characters"];

  if (charactersRaw !== undefined) {
    if (!Array.isArray(charactersRaw)) {
      return {
        ok: false,
        response: jsonError(400, "invalid_characters", "characters must be an array"),
      };
    }

    characters = [];
    for (const item of charactersRaw) {
      if (!isPlainObject(item)) {
        return {
          ok: false,
          response: jsonError(400, "invalid_character_patch", "Each character patch must be a JSON object"),
        };
      }

      const id = readNonEmptyString(item, "id");
      if (!id) {
        return {
          ok: false,
          response: jsonError(400, "missing_character_id", "Each character patch requires id"),
        };
      }

      const role = readOptionalString(item, "role");
      const dramaticGoal = readOptionalString(item, "dramaticGoal");
      const conflictRole = readOptionalString(item, "conflictRole");
      const relationshipSummary = readOptionalString(item, "relationshipSummary");
      const arcSummary = readOptionalString(item, "arcSummary");
      const basePrompt = readOptionalString(item, "basePrompt");
      const isLead = readOptionalBoolean(item, "isLead");

      if (isLead === null) {
        return {
          ok: false,
          response: jsonError(400, "invalid_is_lead", "isLead must be a boolean"),
        };
      }

      characters.push({
        id,
        ...(role !== undefined ? { role } : {}),
        ...(dramaticGoal !== undefined ? { dramaticGoal } : {}),
        ...(conflictRole !== undefined ? { conflictRole } : {}),
        ...(relationshipSummary !== undefined ? { relationshipSummary } : {}),
        ...(arcSummary !== undefined ? { arcSummary } : {}),
        ...(basePrompt !== undefined ? { basePrompt } : {}),
        ...(isLead !== undefined ? { isLead } : {}),
      });
    }
  }

  return {
    ok: true,
    value: {
      ...(leadCharacterId ? { leadCharacterId } : {}),
      ...(characters !== undefined ? { characters } : {}),
    },
  };
}

export function validateCastLockBody(body: unknown): ValidationResult<CastLockRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const leadCharacterId = readNonEmptyString(body, "leadCharacterId");
  if (!leadCharacterId) {
    return {
      ok: false,
      response: jsonError(400, "missing_lead_character_id", "leadCharacterId is required"),
    };
  }

  return {
    ok: true,
    value: { leadCharacterId },
  };
}

export function validateOutlinePatchBody(body: unknown): ValidationResult<OutlinePatchRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const storyOutline = body.storyOutline;
  if (storyOutline === undefined) {
    return {
      ok: false,
      response: jsonError(400, "missing_story_outline", "storyOutline is required"),
    };
  }

  if (!(Array.isArray(storyOutline) || isPlainObject(storyOutline))) {
    return {
      ok: false,
      response: jsonError(400, "invalid_story_outline", "storyOutline must be a JSON object or array"),
    };
  }

  return {
    ok: true,
    value: {
      storyOutline,
    },
  };
}

export function validateProjectUpdateBody(body: unknown): ValidationResult<ProjectUpdateRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const title = readOptionalString(body, "title");
  const type = readOptionalEnum(body, "type", ALLOWED_PROJECT_TYPES);
  const aspect = readOptionalEnum(body, "aspect", ALLOWED_ASPECTS);
  const worldSetting = readOptionalString(body, "worldSetting");
  const era = readOptionalString(body, "era");

  if ("title" in body && !readNonEmptyString(body, "title")) {
    return {
      ok: false,
      response: jsonError(400, "missing_title", "title is required"),
    };
  }

  if (type === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_type", "type must be short-drama or manga-drama"),
    };
  }

  if (aspect === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_aspect", "aspect must be either 16:9 or 9:16"),
    };
  }

  return {
    ok: true,
    value: {
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(aspect !== undefined ? { aspect } : {}),
      ...(worldSetting !== undefined ? { worldSetting } : {}),
      ...(era !== undefined ? { era } : {}),
    },
  };
}

export function validateCharacterPatchBody(body: unknown): ValidationResult<CharacterPatchRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const stringFields = [
    "name",
    "aliases",
    "gender",
    "ageRange",
    "role",
    "facialFeatures",
    "hairstyle",
    "bodyType",
    "wardrobeBase",
    "temperamentTags",
    "typicalExpressions",
    "typicalActions",
    "anchorFace",
    "anchorHair",
    "anchorWardrobe",
    "wardrobeVariants",
    "emotionRange",
    "sceneOutfits",
    "relationships",
    "basePrompt",
    "dramaticGoal",
    "conflictRole",
    "relationshipSummary",
    "arcSummary",
  ] as const;

  const value: CharacterPatchRequestBody = {};
  for (const field of stringFields) {
    const next = body[field];
    if (next === undefined) continue;
    if (typeof next !== "string") {
      return {
        ok: false,
        response: jsonError(400, "invalid_character_field", `${field} must be a string`),
      };
    }
    value[field] = next;
  }

  const isLead = readOptionalBoolean(body, "isLead");
  if (isLead === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_is_lead", "isLead must be a boolean"),
    };
  }
  if (isLead !== undefined) {
    value.isLead = isLead;
  }

  const voiceProfile = readOptionalObject(body, "voiceProfile");
  if (voiceProfile === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_voice_profile", "voiceProfile must be a JSON object"),
    };
  }
  if (voiceProfile) {
    const voiceValue: NonNullable<CharacterPatchRequestBody["voiceProfile"]> = {};
    const voiceStringFields = [
      "voiceType",
      "ageFeeling",
      "emotionStyle",
      "speechRate",
      "pauseStyle",
      "languageStyle",
      "provider",
      "voiceId",
      "extraParams",
    ] as const;

    for (const field of voiceStringFields) {
      const next = voiceProfile[field];
      if (next === undefined) continue;
      if (typeof next !== "string") {
        return {
          ok: false,
          response: jsonError(400, "invalid_voice_profile_field", `${field} must be a string`),
        };
      }
      voiceValue[field] = next;
    }

    const volume = readOptionalNumber(voiceProfile, "volume", { min: 0, max: 5 });
    if (volume === null) {
      return {
        ok: false,
        response: jsonError(400, "invalid_voice_volume", "voiceProfile.volume must be a number between 0 and 5"),
      };
    }
    if (volume !== undefined) {
      voiceValue.volume = volume;
    }

    value.voiceProfile = voiceValue;
  }

  return { ok: true, value };
}

export function validateEpisodeUpdateBody(body: unknown): ValidationResult<EpisodeUpdateRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const title = readOptionalString(body, "title");
  const summary = readOptionalString(body, "summary");
  const hook = readOptionalString(body, "hook");
  const cliffhanger = readOptionalString(body, "cliffhanger");
  const prevLink = readOptionalString(body, "prevLink");
  const scriptDraft = readOptionalString(body, "scriptDraft");
  const scriptMeta = readOptionalString(body, "scriptMeta");
  const scriptSource = readOptionalEnum(body, "scriptSource", ALLOWED_EPISODE_SCRIPT_SOURCES);
  const productionStage = readOptionalEnum(body, "productionStage", ALLOWED_EPISODE_PRODUCTION_STAGES);

  if (scriptSource === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_script_source", "scriptSource must be manual or generated"),
    };
  }

  if (productionStage === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_production_stage", "productionStage is invalid"),
    };
  }

  return {
    ok: true,
    value: {
      ...(title !== undefined ? { title } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(hook !== undefined ? { hook } : {}),
      ...(cliffhanger !== undefined ? { cliffhanger } : {}),
      ...(prevLink !== undefined ? { prevLink } : {}),
      ...(scriptDraft !== undefined ? { scriptDraft } : {}),
      ...(scriptMeta !== undefined ? { scriptMeta } : {}),
      ...(scriptSource !== undefined ? { scriptSource } : {}),
      ...(productionStage !== undefined ? { productionStage } : {}),
    },
  };
}

export function validateEpisodeScriptPatchBody(
  body: unknown
): ValidationResult<EpisodeScriptPatchRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const title = readOptionalString(body, "title");
  const summary = readOptionalString(body, "summary");
  const hook = readOptionalString(body, "hook");
  const cliffhanger = readOptionalString(body, "cliffhanger");
  const scriptDraft = readOptionalString(body, "scriptDraft");
  const scriptMeta = readOptionalString(body, "scriptMeta");
  const scriptSource = readOptionalEnum(body, "scriptSource", ALLOWED_EPISODE_SCRIPT_SOURCES);

  if (scriptSource === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_script_source", "scriptSource must be manual or generated"),
    };
  }

  return {
    ok: true,
    value: {
      ...(scriptDraft !== undefined ? { scriptDraft } : {}),
      ...(scriptMeta !== undefined ? { scriptMeta } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(hook !== undefined ? { hook } : {}),
      ...(cliffhanger !== undefined ? { cliffhanger } : {}),
      ...(scriptSource !== undefined ? { scriptSource } : {}),
    },
  };
}

export function validateCharacterCreateBody(body: unknown): ValidationResult<CharacterCreateRequestBody> {
  const parsed = validateCharacterPatchBody(body);
  if (!parsed.ok) {
    return parsed;
  }

  const name = parsed.value.name?.trim();
  if (!name) {
    return {
      ok: false,
      response: jsonError(400, "missing_name", "name is required"),
    };
  }

  return {
    ok: true,
    value: {
      ...parsed.value,
      name,
    },
  };
}

export function validateQaReviewPatchBody(body: unknown): ValidationResult<QaReviewPatchRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const reviewId = readNonEmptyString(body, "reviewId");
  const verdict = readOptionalEnum(body, "verdict", ALLOWED_REVIEW_VERDICTS);
  const suggestion = readOptionalEnum(body, "suggestion", ALLOWED_REVIEW_SUGGESTIONS);
  const details = readOptionalString(body, "details");

  if (!reviewId) {
    return {
      ok: false,
      response: jsonError(400, "missing_review_id", "reviewId is required"),
    };
  }

  if (verdict === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_verdict", "verdict must be pass, warn, or fail"),
    };
  }

  if (suggestion === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_suggestion", "suggestion is invalid"),
    };
  }

  return {
    ok: true,
    value: {
      reviewId,
      ...(verdict !== undefined ? { verdict } : {}),
      ...(suggestion !== undefined ? { suggestion } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function validateShotPatchBody(body: unknown): ValidationResult<ShotPatchRequestBody> {
  if (body == null) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const autoContinue = readOptionalBoolean(body, "autoContinue");
  const clearBlock = readOptionalBoolean(body, "clearBlock");

  if (autoContinue === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_auto_continue", "autoContinue must be a boolean"),
    };
  }

  if (clearBlock === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_clear_block", "clearBlock must be a boolean"),
    };
  }

  return {
    ok: true,
    value: {
      ...(autoContinue !== undefined ? { autoContinue } : {}),
      ...(clearBlock !== undefined ? { clearBlock } : {}),
    },
  };
}

export function validateTakePatchBody(body: unknown): ValidationResult<TakePatchRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const isDiscarded = readOptionalBoolean(body, "isDiscarded");
  const discardReason = readOptionalString(body, "discardReason");

  if (isDiscarded === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_is_discarded", "isDiscarded must be a boolean"),
    };
  }

  return {
    ok: true,
    value: {
      ...(isDiscarded !== undefined ? { isDiscarded } : {}),
      ...(discardReason !== undefined ? { discardReason } : {}),
    },
  };
}

export function validateShotAdoptBody(body: unknown): ValidationResult<ShotAdoptRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const takeId = readNonEmptyString(body, "takeId");
  const takeType = readOptionalEnum(body, "takeType", ALLOWED_TAKE_TYPES);

  if (!takeId) {
    return {
      ok: false,
      response: jsonError(400, "missing_take_id", "takeId is required"),
    };
  }

  if (takeType === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_take_type", "takeType must be image, video, audio, sfx, or bgm"),
    };
  }

  return {
    ok: true,
    value: {
      takeId,
      ...(takeType !== undefined ? { takeType } : {}),
    },
  };
}

export function validateShotDialoguePatchBody(
  body: unknown
): ValidationResult<ShotDialoguePatchRequestBody> {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonError(400, "invalid_body", "Request body must be a JSON object") };
  }

  const dialogue = readOptionalString(body, "dialogue");
  const audioPrompt = readOptionalString(body, "audioPrompt");
  const sentenceIndex = readOptionalInteger(body, "sentenceIndex", { min: 0, max: 10000 });
  const newSentenceText = readOptionalString(body, "newSentenceText");

  if (sentenceIndex === null) {
    return {
      ok: false,
      response: jsonError(400, "invalid_sentence_index", "sentenceIndex must be a non-negative integer"),
    };
  }

  if ((sentenceIndex === undefined) !== (newSentenceText === undefined)) {
    return {
      ok: false,
      response: jsonError(
        400,
        "invalid_sentence_patch",
        "sentenceIndex and newSentenceText must be provided together"
      ),
    };
  }

  if (dialogue === undefined && sentenceIndex === undefined && audioPrompt === undefined) {
    return {
      ok: false,
      response: jsonError(
        400,
        "missing_dialogue_update",
        "Provide dialogue, audioPrompt, or sentenceIndex with newSentenceText"
      ),
    };
  }

  return {
    ok: true,
    value: {
      ...(dialogue !== undefined ? { dialogue } : {}),
      ...(audioPrompt !== undefined ? { audioPrompt } : {}),
      ...(sentenceIndex !== undefined ? { sentenceIndex } : {}),
      ...(newSentenceText !== undefined ? { newSentenceText } : {}),
    },
  };
}

export async function validateCharacterAssetUpload(file: File): Promise<ValidationResult<{ extension: string; buffer: Buffer }>> {
  if (!file) {
    return { ok: false, response: jsonError(400, "missing_file", "No file uploaded") };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_CHARACTER_ASSET_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      response: jsonError(400, "invalid_file_extension", "Only jpg, jpeg, png, webp files are allowed"),
    };
  }

  if (file.type && !ALLOWED_CHARACTER_ASSET_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      response: jsonError(400, "invalid_file_type", "Only JPEG, PNG, and WebP uploads are allowed"),
    };
  }

  if (file.size <= 0 || file.size > MAX_CHARACTER_ASSET_BYTES) {
    return {
      ok: false,
      response: jsonError(400, "invalid_file_size", "Uploaded image must be between 1 byte and 10 MB"),
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      return {
        ok: false,
        response: jsonError(400, "invalid_image", "Unable to read image dimensions"),
      };
    }

    if (
      metadata.width > MAX_CHARACTER_ASSET_DIMENSION ||
      metadata.height > MAX_CHARACTER_ASSET_DIMENSION
    ) {
      return {
        ok: false,
        response: jsonError(400, "image_too_large", "Image dimensions must not exceed 4096x4096"),
      };
    }
  } catch {
    return {
      ok: false,
      response: jsonError(400, "invalid_image", "Uploaded file is not a valid image"),
    };
  }

  return {
    ok: true,
    value: {
      extension,
      buffer,
    },
  };
}
