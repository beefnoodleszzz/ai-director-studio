import { prisma } from "@/lib/prisma";
import { appendTaskLog, getRecoverableTasks } from "@/lib/task-queue";
import { isReplayableTaskType, replayTask, shouldSkipRecoveredTask } from "@/lib/task-replayer";

const RECOVERY_DELAY_MS = 2000;

let recoveryStarted = false;

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

  await Promise.all(
    queuedTasks.map(async (task) => {
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
          await appendTaskLog(task.id, `[RECOVERY] Marked failed because ${task.taskType} cannot be replayed`);
          return;
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
          await appendTaskLog(task.id, "[RECOVERY] Skipped because target output already exists");
          return;
        }

        await appendTaskLog(task.id, "[RECOVERY] Replaying queued task after restart");
        await replayTask(task.id);
      } catch (error) {
        await appendTaskLog(
          task.id,
          `[RECOVERY] Replay failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
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
