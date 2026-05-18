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
}

interface TaskRuntimeContext {
  taskId: string;
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
  return task.id;
}

// ─── 执行任务 ─────────────────────────────────────────────────────────────────

export async function runTask<T>(
  taskId: string,
  fn: () => Promise<T>
): Promise<T> {
  await prisma.generationTask.update({
    where: { id: taskId },
    data: { status: "running", startedAt: new Date() },
  });

  return pQueue.add(async () => {
    const task = await prisma.generationTask.findUnique({
      where: { id: taskId },
    });
    if (!task) throw new Error(`Task ${taskId} not found`);

    const attempts = task.attempts + 1;
    await prisma.generationTask.update({
      where: { id: taskId },
      data: { attempts, status: "running" },
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
      return result;
    } catch (err) {
      const errorReason = err instanceof Error ? err.message : String(err);
      await appendTaskLog(taskId, `[ERROR] attempt ${attempts}: ${errorReason}`);

      if (attempts >= task.maxAttempts) {
        await prisma.generationTask.update({
          where: { id: taskId },
          data: { status: "failed", errorReason, completedAt: new Date() },
        });
      } else {
        await prisma.generationTask.update({
          where: { id: taskId },
          data: { status: "retrying", errorReason },
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

  await appendTaskLog(
    taskId,
    `[BLOCKED] ${input.blockReason}: ${input.blockMeta.message}`
  );
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

// ─── 日志追加 ─────────────────────────────────────────────────────────────────

export async function appendTaskLog(taskId: string, message: string) {
  const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const timestamp = new Date().toISOString();
  const newLog = task.logs
    ? `${task.logs}\n[${timestamp}] ${message}`
    : `[${timestamp}] ${message}`;
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
}

// ─── 暂停任务 ─────────────────────────────────────────────────────────────────

export async function pauseTask(taskId: string) {
  await prisma.generationTask.update({
    where: { id: taskId },
    data: { status: "paused" },
  });
}

// ─── 恢复任务 ─────────────────────────────────────────────────────────────────

export async function resumeTask(taskId: string) {
  await prisma.generationTask.update({
    where: { id: taskId },
    data: { status: "queued" },
  });
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
