/**
 * 持久化任务系统
 *
 * 基于 GenerationTask 数据库表实现任务调度，替代内存 Map + SSE 方案。
 * 应用重启后可从数据库扫描未完成任务，支持断点恢复。
 *
 * 状态机：queued → running → retrying → paused / failed / completed / cancelled
 */

import PQueue from "p-queue";
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "./prisma";
import type { BlockMeta, TaskStage } from "./studio-contracts";

export type TaskType =
  | "script-breakdown"
  | "image"
  | "video"
  | "audio"
  | "sfx"
  | "bgm"
  | "assembly"
  | "qa";

export type TaskStatus =
  | "queued"
  | "running"
  | "retrying"
  | "paused"
  | "failed"
  | "completed"
  | "cancelled";

export interface CreateTaskInput {
  projectId: string;
  shotId?: string;
  parentTaskId?: string;
  taskType: TaskType;
  taskStage?: TaskStage;
  priority?: number;
  maxAttempts?: number;
  inputRef?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  outputRef?: Record<string, unknown>;
  errorReason?: string;
  blockReason?: string;
  blockMeta?: BlockMeta | null;
  events?: TaskEvent[];
}

interface TaskRuntimeContext {
  taskId: string;
}

export type TaskEventType =
  | "queued"
  | "running"
  | "completed"
  | "retrying"
  | "failed"
  | "paused"
  | "cancelled"
  | "error"
  | "recovery";

export interface TaskEvent {
  timestamp: string;
  type: TaskEventType | "note";
  message: string;
  details?: Record<string, unknown>;
}

// ─── 内部并发队列（控制同时运行的任务数，不影响持久化） ────────────────────────

const concurrency = Number(process.env.GENERATION_CONCURRENCY ?? 2);
const pQueue = new PQueue({ concurrency });
const taskRuntime = new AsyncLocalStorage<TaskRuntimeContext>();

// ─── 创建任务 ─────────────────────────────────────────────────────────────────

export async function createTask(input: CreateTaskInput): Promise<string> {
  const task = await prisma.generationTask.create({
    data: {
      projectId: input.projectId,
      shotId: input.shotId,
      parentTaskId: input.parentTaskId,
      taskType: input.taskType,
      taskStage: input.taskStage ?? "",
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      inputRef: input.inputRef ? JSON.stringify(input.inputRef) : "",
      status: "queued",
    },
  });
  await appendTaskEvent(task.id, "queued", "Task queued", {
    taskType: input.taskType,
    taskStage: input.taskStage ?? "",
    priority: input.priority ?? 0,
  });
  return task.id;
}

// ─── 执行任务 ─────────────────────────────────────────────────────────────────

export async function runTask<T>(
  taskId: string,
  fn: () => Promise<T>
): Promise<T> {
  const claimed = await prisma.generationTask.updateMany({
    where: {
      id: taskId,
      status: { in: ["queued", "retrying"] },
    },
    data: { status: "running", startedAt: new Date() },
  });

  if (claimed.count === 0) {
    const existing = await prisma.generationTask.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    if (!existing) throw new Error(`Task ${taskId} not found`);
    throw new Error(`Task ${taskId} cannot be started from status ${existing.status}`);
  }

  await appendTaskEvent(taskId, "running", "Task started");

  return pQueue.add(async () => {
    const task = await prisma.generationTask.findUnique({
      where: { id: taskId },
    });
    if (!task) throw new Error(`Task ${taskId} not found`);

    const attempts = task.attempts + 1;
    await prisma.generationTask.update({
      where: { id: taskId },
      data: { attempts },
    });

    try {
      const result = await taskRuntime.run({ taskId }, fn);
      await prisma.generationTask.update({
        where: { id: taskId },
        data: {
          status: "completed",
          completedAt: new Date(),
          outputRef: result ? JSON.stringify(result) : "",
        },
      });
      await appendTaskEvent(taskId, "completed", "Task completed");
      return result;
    } catch (err) {
      const errorReason = err instanceof Error ? err.message : String(err);
      await appendTaskEvent(taskId, "error", `Attempt ${attempts} failed`, {
        errorReason,
        attempt: attempts,
      });

      if (attempts >= task.maxAttempts) {
        await prisma.generationTask.update({
          where: { id: taskId },
          data: { status: "failed", errorReason, completedAt: new Date() },
        });
        await appendTaskEvent(taskId, "failed", "Task failed", {
          errorReason,
          attempt: attempts,
        });
      } else {
        await prisma.generationTask.update({
          where: { id: taskId },
          data: { status: "retrying", errorReason },
        });
        await appendTaskEvent(taskId, "retrying", "Task scheduled for retry", {
          errorReason,
          attempt: attempts,
          maxAttempts: task.maxAttempts,
        });
      }
      throw err;
    }
  }) as T;
}

export function getCurrentTaskId() {
  return taskRuntime.getStore()?.taskId ?? null;
}

export async function markCurrentTaskBlocked(input: {
  blockReason: string;
  blockMeta: BlockMeta;
}) {
  const taskId = getCurrentTaskId();
  if (!taskId) return;

  await prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: "paused",
      blockReason: input.blockReason,
      blockMeta: JSON.stringify(input.blockMeta),
      completedAt: new Date(),
    },
  });

  await appendTaskEvent(taskId, "paused", input.blockMeta.message, {
    blockReason: input.blockReason,
    stage: input.blockMeta.stage,
    details: input.blockMeta.details,
  });
}

// ─── 便捷：创建 + 运行 ─────────────────────────────────────────────────────────

export async function enqueueTask<T>(
  input: CreateTaskInput,
  fn: () => Promise<T>
): Promise<{ taskId: string; result: T }> {
  const taskId = await createTask(input);
  const result = await runTask(taskId, fn);
  return { taskId, result };
}

export async function dispatchTask<T>(
  input: CreateTaskInput,
  fn: () => Promise<T>
): Promise<{ taskId: string }> {
  const taskId = await createTask(input);
  void runTask(taskId, fn).catch((error) => {
    console.error(`[task-queue] background task ${taskId} failed`, error);
  });
  return { taskId };
}

// ─── 日志追加 ─────────────────────────────────────────────────────────────────

export async function appendTaskLog(taskId: string, message: string) {
  await appendTaskEvent(taskId, "note", message);
}

export function parseTaskEvents(rawLogs: string | null | undefined): TaskEvent[] {
  if (!rawLogs) return [];

  return rawLogs
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const structuredMatch = line.match(/^\[(.+?)\]\s+(\{.*\})$/);
      if (structuredMatch) {
        const [, timestamp, rawJson] = structuredMatch;
        try {
          const parsed = JSON.parse(rawJson) as Omit<TaskEvent, "timestamp">;
          return {
            timestamp,
            type: parsed.type ?? "note",
            message: parsed.message ?? "",
            ...(parsed.details ? { details: parsed.details } : {}),
          } satisfies TaskEvent;
        } catch {
          // fall through to legacy parsing
        }
      }

      const legacyMatch = line.match(/^\[(.+?)\]\s+(.*)$/);
      if (legacyMatch) {
        return {
          timestamp: legacyMatch[1],
          type: "note",
          message: legacyMatch[2],
        } satisfies TaskEvent;
      }

      return {
        timestamp: new Date(0).toISOString(),
        type: "note",
        message: line,
      } satisfies TaskEvent;
    });
}

export async function appendTaskEvent(
  taskId: string,
  type: TaskEvent["type"],
  message: string,
  details?: Record<string, unknown>
) {
  const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const timestamp = new Date().toISOString();
  const event: TaskEvent = {
    timestamp,
    type,
    message,
    ...(details ? { details } : {}),
  };
  const serialized = `[${timestamp}] ${JSON.stringify({
    type: event.type,
    message: event.message,
    ...(event.details ? { details: event.details } : {}),
  })}`;
  const newLog = task.logs ? `${task.logs}\n${serialized}` : serialized;
  await prisma.generationTask.update({
    where: { id: taskId },
    data: { logs: newLog },
  });
}

// ─── 取消任务 ─────────────────────────────────────────────────────────────────

export async function cancelTask(taskId: string) {
  await prisma.generationTask.update({
    where: { id: taskId },
    data: { status: "cancelled", completedAt: new Date() },
  });
  await appendTaskEvent(taskId, "cancelled", "Task cancelled");
}

// ─── 暂停任务 ─────────────────────────────────────────────────────────────────

export async function pauseTask(taskId: string) {
  await prisma.generationTask.update({
    where: { id: taskId },
    data: { status: "paused" },
  });
  await appendTaskEvent(taskId, "paused", "Task paused");
}

// ─── 恢复任务 ─────────────────────────────────────────────────────────────────

export async function resumeTask(taskId: string) {
  await prisma.generationTask.update({
    where: { id: taskId },
    data: { status: "queued" },
  });
  await appendTaskEvent(taskId, "queued", "Task re-queued");
}

// ─── 查询任务状态 ─────────────────────────────────────────────────────────────

export async function getTaskStatus(taskId: string): Promise<TaskResult | null> {
  const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
  if (!task) return null;
  let blockMeta: BlockMeta | null = null;
  if (task.blockMeta) {
    try {
      blockMeta = JSON.parse(task.blockMeta) as BlockMeta;
    } catch {
      blockMeta = null;
    }
  }
  return {
    taskId: task.id,
    status: task.status as TaskStatus,
    outputRef: task.outputRef ? JSON.parse(task.outputRef) : undefined,
    errorReason: task.errorReason || undefined,
    blockReason: task.blockReason || undefined,
    blockMeta,
    events: parseTaskEvents(task.logs),
  };
}

// ─── 应用启动恢复：扫描未完成任务 ─────────────────────────────────────────────

export async function getRecoverableTasks(projectId?: string) {
  return prisma.generationTask.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      status: { in: ["queued", "running", "retrying"] },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

// ─── 批量查询项目任务列表 ─────────────────────────────────────────────────────

export async function getProjectTasks(projectId: string, limit = 50) {
  return prisma.generationTask.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ─── 队列统计 ─────────────────────────────────────────────────────────────────

export function getQueueStats() {
  return {
    size: pQueue.size,
    pending: pQueue.pending,
    concurrency: pQueue.concurrency,
  };
}
