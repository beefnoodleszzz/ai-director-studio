/**
 * Workflow 共享类型定义
 */

export interface ScriptBreakdownResult {
  episodeSummary: string;
  hook: string;
  cliffhanger: string;
  newCharacters: NewCharacterDraft[];
  scenes: SceneBreakdown[];
}

export interface NewCharacterDraft {
  name: string;
  description: string
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
}

export interface VideoGenInput {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  adoptedTakeId: string;
  visualPrompt: string;
  provider?: string;
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
  suggestion: QASuggestion;
  details: string;
}
