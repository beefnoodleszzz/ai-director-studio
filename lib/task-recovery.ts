import { prisma } from "@/lib/prisma";
import { appendTaskEvent, appendTaskLog, getRecoverableTasks } from "@/lib/task-queue";
import { isReplayableTaskType, replayTask, shouldSkipRecoveredTask } from "@/lib/task-replayer";

const RECOVERY_DELAY_MS = 2000;

let recoveryStarted = false;

interface RecoverableQueuedTask {
  id: string;
  taskType: string;
  attempts: number;
  maxAttempts: number;
  status: string;
}

export function partitionQueuedRecoveryTasks<T extends RecoverableQueuedTask>(tasks: T[]) {
  const recoverable: T[] = [];
  const exhausted: T[] = [];

  for (const task of tasks) {
    if (task.attempts >= task.maxAttempts) {
      exhausted.push(task);
    } else {
      recoverable.push(task);
    }
  }

  return { recoverable, exhausted };
}


async function markInterruptedTasksFailed() {
  const interruptedTasks = await prisma.generationTask.findMany({
    where: { status: { in: ["running", "retrying"] } },
    select: { id: true },
  });

  if (interruptedTasks.length === 0) return;

  await prisma.generationTask.updateMany({
    where: { id: { in: interruptedTasks.map((task) => task.id) } },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorReason: "Server restarted before task completion",
    },
  });

  await Promise.all(
    interruptedTasks.map((task) =>
      appendTaskLog(task.id, "[RECOVERY] Marked failed after server restart")
    )
  );
}

async function recoverQueuedTasks() {
  const tasks = await getRecoverableTasks();
  const queuedTasks = tasks.filter((task) => task.status === "queued");
  const { recoverable, exhausted } = partitionQueuedRecoveryTasks(queuedTasks);

  if (exhausted.length > 0) {
    await prisma.generationTask.updateMany({
      where: { id: { in: exhausted.map((task) => task.id) } },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorReason: "Task exhausted max recovery attempts",
      },
    });

    await Promise.all(
      exhausted.map((task) =>
        appendTaskEvent(task.id, "recovery", "Marked failed because attempts reached maxAttempts")
      )
    );
  }

  for (const task of recoverable) {
    try {
      if (!isReplayableTaskType(task.taskType)) {
        await prisma.generationTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            errorReason: `Task type ${task.taskType} is not recoverable`,
          },
        });
        await appendTaskEvent(task.id, "recovery", `Marked failed because ${task.taskType} cannot be replayed`);
        continue;
      }

      const shouldSkip = await shouldSkipRecoveredTask(task);
      if (shouldSkip) {
        await prisma.generationTask.update({
          where: { id: task.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            errorReason: "",
          },
        });
        await appendTaskEvent(task.id, "recovery", "Skipped because target output already exists");
        continue;
      }

      await appendTaskEvent(task.id, "recovery", "Replaying queued task after restart");
      await replayTask(task.id);
    } catch (error) {
      await appendTaskLog(
        task.id,
        `[RECOVERY] Replay failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function runRecoveryCycle() {
  await markInterruptedTasksFailed();
  await recoverQueuedTasks();
}

export function initializeTaskRecovery() {
  if (recoveryStarted) return;
  recoveryStarted = true;
  setTimeout(() => {
    void runRecoveryCycle().catch((error) => {
      console.error("[task-recovery]", error);
    });
  }, RECOVERY_DELAY_MS);
}
