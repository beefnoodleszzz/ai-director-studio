export interface PolledTaskStatus {
  taskId: string;
  status: string;
  outputRef?: Record<string, unknown>;
  errorReason?: string;
  blockReason?: string;
  blockMeta?: Record<string, unknown> | null;
}

const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "paused", "cancelled"]);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function pollTaskUntilSettled(
  taskId: string,
  options?: { intervalMs?: number; timeoutMs?: number }
): Promise<PolledTaskStatus> {
  const intervalMs = options?.intervalMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`/api/task/status?taskId=${taskId}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch task status (${response.status})`);
    }

    const payload = (await response.json()) as PolledTaskStatus;
    if (TERMINAL_TASK_STATUSES.has(payload.status)) {
      return payload;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Task ${taskId} timed out while waiting for completion`);
}
