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

export interface ScriptBreakdownResult {
  scenes: SceneCard[];
  episodeSummary: string;
}

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

export type TaskStatus = {
  taskId: string;
  type: "image" | "video" | "audio" | "assemble";
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  message?: string;
  result?: string;
};
