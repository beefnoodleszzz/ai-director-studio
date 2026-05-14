/**
 * 全局共享类型定义
 * 注意：业务 DTO 请放在各 workflow 的 types.ts 中
 */

export interface GenerateImageResult {
  imageUrl: string;
  localPath?: string;
}

export interface VideoTaskResult {
  taskId: string;
  status: "submitted" | "processing" | "completed" | "failed";
  progress: number;
  videoUrl?: string;
  localPath?: string;
}

export interface AudioResult {
  audioUrl: string;
  localPath?: string;
}

// 保留兼容旧 models/text.ts 的引用
export interface SceneCard {
  sceneOrder: number;
  visualPrompt: string;
  dialogue: string;
  audioPrompt: string;
}

export interface CharacterRef {
  name: string;
  prompt: string;
  refImageUrl?: string;
}

export interface NewCharacterDraft {
  name: string;
  description: string;
}

export interface ScriptBreakdownResult {
  newCharacters: NewCharacterDraft[];
  scenes: SceneCard[];
  episodeSummary: string;
}
