import { prisma } from "@/lib/prisma";
import { createTask, runTask } from "@/lib/task-queue";
import { generateShotImages } from "@/lib/workflows/image-generation";
import { generateShotVideo } from "@/lib/workflows/video-generation";
import { generateShotAudio } from "@/lib/workflows/audio-generation";
import { assembleShortDrama } from "@/lib/workflows/assembly";
import { breakdownScript, type BreakdownScriptInput } from "@/lib/workflows/script-breakdown";
import type { AssemblyInput, AudioGenInput, ImageGenInput, VideoGenInput } from "@/lib/workflows/types";

export const REPLAYABLE_TASK_TYPES = ["script-breakdown", "image", "video", "audio", "assembly"] as const;
export type ReplayableTaskType = (typeof REPLAYABLE_TASK_TYPES)[number];

interface ReplayableTaskRecord {
  id: string;
  projectId: string;
  shotId: string | null;
  parentTaskId: string | null;
  taskType: string;
  taskStage: string;
  priority: number;
  maxAttempts: number;
  inputRef: string;
}

export function isReplayableTaskType(taskType: string): taskType is ReplayableTaskType {
  return REPLAYABLE_TASK_TYPES.includes(taskType as ReplayableTaskType);
}

function parseInputRef<T>(raw: string): T {
  if (!raw) throw new Error("Task inputRef is empty");
  return JSON.parse(raw) as T;
}

async function executeTaskByType(taskType: ReplayableTaskType, inputRef: string) {
  switch (taskType) {
    case "image":
      return generateShotImages(parseInputRef<ImageGenInput>(inputRef));
    case "video":
      return generateShotVideo(parseInputRef<VideoGenInput>(inputRef));
    case "audio":
      return generateShotAudio(parseInputRef<AudioGenInput>(inputRef));
    case "assembly":
      return assembleShortDrama(parseInputRef<AssemblyInput>(inputRef));
    case "script-breakdown":
      return breakdownScript(parseInputRef<BreakdownScriptInput>(inputRef));
    default:
      throw new Error(`Task type ${taskType} is not replayable`);
  }
}

export async function replayTask(taskId: string) {
  const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (!["script-breakdown", "image", "video", "audio", "assembly"].includes(task.taskType)) {
    throw new Error(`Task type ${task.taskType} is not replayable`);
  }

  return runTask(task.id, () =>
    executeTaskByType(task.taskType as ReplayableTaskType, task.inputRef)
  );
}

export async function cloneTaskForRetry(taskId: string) {
  const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (!["script-breakdown", "image", "video", "audio", "assembly"].includes(task.taskType)) {
    throw new Error(`Retry not supported for taskType: ${task.taskType}`);
  }

  const newTaskId = await createTask({
    projectId: task.projectId,
    shotId: task.shotId ?? undefined,
    parentTaskId: task.parentTaskId ?? undefined,
    taskType: task.taskType as ReplayableTaskType,
    taskStage: task.taskStage as "" | "image" | "video" | "audio" | "review" | "export",
    priority: task.priority,
    maxAttempts: task.maxAttempts,
    inputRef: task.inputRef ? parseInputRef<Record<string, unknown>>(task.inputRef) : undefined,
  });

  await replayTask(newTaskId);
  return newTaskId;
}

export async function shouldSkipRecoveredTask(task: ReplayableTaskRecord) {
  const input = task.inputRef ? parseInputRef<Record<string, unknown>>(task.inputRef) : {};

  if (task.taskType === "image" && task.shotId) {
    const shot = await prisma.shot.findUnique({
      where: { id: task.shotId },
      select: { adoptedImageTakeId: true },
    });
    return Boolean(shot?.adoptedImageTakeId);
  }

  if (task.taskType === "video" && task.shotId) {
    const shot = await prisma.shot.findUnique({
      where: { id: task.shotId },
      select: { adoptedVideoTakeId: true },
    });
    return Boolean(shot?.adoptedVideoTakeId);
  }

  if (task.taskType === "audio" && task.shotId) {
    const shot = await prisma.shot.findUnique({
      where: { id: task.shotId },
      select: { adoptedAudioTakeId: true },
    });
    return Boolean(shot?.adoptedAudioTakeId);
  }

  if (task.taskType === "assembly") {
    const episodeId = typeof input.episodeId === "string" ? input.episodeId : "";
    if (!episodeId) return false;
    const exportRecord = await prisma.exportRecord.findFirst({
      where: { projectId: task.projectId, episodeId, exportType: "short-drama" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return Boolean(exportRecord);
  }

  if (task.taskType === "script-breakdown") {
    const episodeId = typeof input.episodeId === "string" ? input.episodeId : "";
    if (!episodeId) return false;
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: { scenes: { select: { id: true }, take: 1 } },
    });
    return Boolean(episode?.scenes.length);
  }

  return false;
}

