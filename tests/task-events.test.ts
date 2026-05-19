import test from "node:test";
import assert from "node:assert/strict";
import { parseTaskEvents } from "@/lib/task-queue";

test("parseTaskEvents parses structured task event lines", () => {
  const events = parseTaskEvents(
    [
      '[2026-05-19T10:00:00.000Z] {"type":"queued","message":"Task queued","details":{"taskType":"image"}}',
      '[2026-05-19T10:00:01.000Z] {"type":"running","message":"Task started"}',
      "[2026-05-19T10:00:02.000Z] legacy plain text",
    ].join("\n")
  );

  assert.equal(events.length, 3);
  assert.deepEqual(events[0], {
    timestamp: "2026-05-19T10:00:00.000Z",
    type: "queued",
    message: "Task queued",
    details: {
      taskType: "image",
    },
  });
  assert.deepEqual(events[2], {
    timestamp: "2026-05-19T10:00:02.000Z",
    type: "note",
    message: "legacy plain text",
  });
});
