import test from "node:test";
import assert from "node:assert/strict";
import { partitionQueuedRecoveryTasks } from "@/lib/task-recovery";

test("partitionQueuedRecoveryTasks separates recoverable and exhausted queued tasks", () => {
  const tasks = [
    { id: "a", taskType: "image", attempts: 0, maxAttempts: 3, status: "queued" },
    { id: "b", taskType: "video", attempts: 2, maxAttempts: 2, status: "queued" },
    { id: "c", taskType: "audio", attempts: 1, maxAttempts: 2, status: "queued" },
  ];

  const { recoverable, exhausted } = partitionQueuedRecoveryTasks(tasks);

  assert.deepEqual(
    recoverable.map((task) => task.id),
    ["a", "c"]
  );
  assert.deepEqual(
    exhausted.map((task) => task.id),
    ["b"]
  );
});
