/**
 * Workflow 共享类型定义
 */

import type { BlockMeta, ShotPipelineStage, TaskStage } from "@/lib/studio-contracts";

export interface ScriptBreakdownResult {
  episodeSummary: string;
  hook: string;
  cliffhanger: string;
  newCharacters: NewCharacterDraft[];
  scenes: SceneBreakdown[];
}

export interface StoryOutlineCharacter {
  name: string;
  role: string;
  conflictRole: string;
  dramaticGoal: string;
  relationshipSummary?: string;
  arcSummary?: string;
  visualDraft: string;
  voiceDraft: string;
  hook?: string;
  isLead?: boolean;
}

export interface StoryOutlineEpisodeBeat {
  episode?: string;
  episodeNum: number;
  title: string;
  beat?: string;
  logline: string;
  hook: string;
  cliffhanger: string;
  openingTrigger?: string;
  pressureSource?: string;
  escalation?: string;
  emotionalShift?: string;
  sceneGoal?: string;
}

export interface StoryOutlineResult {
  logline: string;
  coreConflict: string;
  leadGoal: string;
  keySuspense: string;
  suspenseBeats?: string[];
  toneAndSell?: string;
  worldRules?: string;
  villainPressure?: string;
  outlineCharacters?: Array<{
    name: string;
    role: string;
    hook: string;
  }>;
  characters: StoryOutlineCharacter[];
  episodeBeats: StoryOutlineEpisodeBeat[];
  blockers?: Array<{
    code: string;
    title: string;
    detail: string;
  }>;
}

export interface NewCharacterDraft {
  name: string;
  description: string
}

export interface StoryCastCharacterResult {
  name: string;
  gender: string;
  ageRange: string;
  role: string;
  conflictRole: string;
  dramaticGoal: string;
  relationshipSummary: string;
  arcSummary: string;
  visualDraft: string;
  voiceDraft: string;
  facialFeatures: string;
  hairstyle: string;
  bodyType: string;
  wardrobeBase: string;
  temperamentTags: string;
  typicalExpressions: string;
  typicalActions: string;
  anchorFace: string;
  anchorHair: string;
  anchorWardrobe: string;
  wardrobeVariants: string;
  emotionRange: string;
  sceneOutfits: string;
  basePrompt: string;
  isLead?: boolean;
}

export interface StoryCastGenerationResult {
  characters: StoryCastCharacterResult[];
}

export interface StoryScriptSceneCard {
  sceneOrder: number;
  location: string;
  objective: string;
  conflict: string;
  turningPoint: string;
  emotion: string;
  hookLine?: string;
  beatType?: string;
  dialogueIntent?: string;
  exitQuestion?: string;
}

export interface StoryScriptDialogueMoment {
  speaker: string;
  target?: string;
  line: string;
  subtext?: string;
  beatPurpose?: string;
  emotion?: string;
  escalation?: string;
  voiceSignature?: string;
  powerMove?: string;
}

export interface StoryScriptDraftResult {
  opening: string;
  openingTrigger: string;
  immediateCost: string;
  escalationBeats: string[];
  payoffMoment: string;
  endingCliffType: string;
  scenePlan: Array<string | StoryScriptSceneCard>;
  dialogueMoments: Array<string | StoryScriptDialogueMoment>;
  fullText: string;
  endingHook: string;
  sceneCards: StoryScriptSceneCard[];
}

export interface SceneBreakdown {
  sceneOrder: number;
  location: string;
  timeOfDay: string;
  timePeriod: string;
  characterNames: string[];
  plotPurpose: string;
  emotionArc: string;
  summary: string;
  shots: ShotBreakdown[];
}

export interface ShotBreakdown {
  shotOrder: number;
  dramaticTag?: string;
  shotType: string;       // ECU | CU | MCU | MS | FS | LS | ELS
  cameraAngle: string;
  cameraMotion: string;
  durationSecs: number;
  actionDesc: string;
  narrativePurpose: string;
  emotionGoal: string;
  visualPrompt: string;   // 英文，直接用于 image gen
  audioPrompt: string;
  dialogue: string;
}

export interface ImageGenInput {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  prompt: string;
  refImageUrls?: string[];
  provider?: string;
  candidateCount?: number;
  /** 使用的 Prompt 模板 ID（记录到 inputRef 用于统计） */
  templateId?: string;
  characterConstraints?: {
    names: string[];
    anchorFace: string[];
    anchorHair: string[];
    wardrobeBase: string[];
    temperamentTags: string[];
    refAssetUrls: string[];
    selectedAssetTypes?: string[];
    selectionSummary?: string;
  };
}

export interface VideoGenInput {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  adoptedImageTakeId?: string;
  visualPrompt: string;
  provider?: string;
  subjectSummary?: string;
  referenceAssetUrls?: string[];
  autoContinue?: boolean;
  stopOnQaFail?: boolean;
  parentTaskId?: string;
}

export interface AudioGenInput {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  dialogue: string;
  audioPrompt: string;
  voiceId?: string;
  provider?: string;
}

export interface AssemblyInput {
  projectId: string;
  episodeId: string;
  aspect?: "16:9" | "9:16";
  bgmPath?: string;
  includePreflight?: boolean;
  minResolution?: {
    width: number;
    height: number;
  };
}

export interface QAVerdictTag {
  code: string;
  label: string;
}

export type QAVerdict = "pass" | "warn" | "fail";
export type QASuggestion = "adopt" | "accept-minor" | "must-redo" | "change-provider";

export interface QAReviewResult {
  verdict: QAVerdict;
  score: number;
  failTags: QAVerdictTag[];
  contentTags?: QAVerdictTag[];
  suggestion: QASuggestion;
  details: string;
}

export interface ScriptContentMeta {
  openingTrigger: string;
  immediateCost: string;
  escalationBeats: string[];
  payoffMoment: string;
  endingCliffType: string;
  contentBlockers: Array<{
    code: string;
    title: string;
    detail: string;
  }>;
  stats: {
    sceneCount: number;
    dialogueMomentCount: number;
    hookPass: boolean;
    escalationPass: boolean;
    cliffhangerPass: boolean;
  };
}

export interface TaskRefPayload {
  shotId?: string;
  episodeId?: string;
  takeId?: string;
  provider?: string;
  templateId?: string;
  outputType?: "image" | "video" | "audio" | "export";
  publicUrl?: string;
  url?: string;
  outputUrl?: string;
  stage?: TaskStage;
  parentTaskId?: string;
}

export interface ShotPipelineState {
  pipelineStage: ShotPipelineStage;
  autoContinue: boolean;
  blockReason: string;
  blockMeta: BlockMeta | null;
}
