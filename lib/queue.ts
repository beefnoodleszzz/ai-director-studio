import PQueue from "p-queue";

const concurrency = Number(process.env.GENERATION_CONCURRENCY ?? 2);

export const generationQueue = new PQueue({ concurrency });

export async function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return generationQueue.add(fn) as Promise<T>;
}

export function getQueueStats() {
  return {
    size: generationQueue.size,
    pending: generationQueue.pending,
    concurrency: generationQueue.concurrency,
  };
}
