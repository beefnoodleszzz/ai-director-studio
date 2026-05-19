import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTaskStatusDeleteQueryParams,
  parseTaskStatusQueryParams,
  validateTaskRetryBody,
} from "@/lib/route-validation";

import { isReplayableTaskType } from "@/lib/task-replayer";

test("parseTaskStatusQueryParams reads task and project identifiers", () => {
  const result = parseTaskStatusQueryParams("https://example.com/api/task/status?taskId=t1&projectId=p1");

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { taskId: "t1", projectId: "p1" });
  }
});

test("parseTaskStatusDeleteQueryParams parses booleans and rejects invalid values", () => {
  const valid = parseTaskStatusDeleteQueryParams(
    "https://example.com/api/task/status?taskId=t1&hardDelete=true&deleteOutput=false"
  );

  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(valid.value, {
      taskId: "t1",
      hardDelete: true,
      deleteOutput: false,
    });
  }

  const invalid = parseTaskStatusDeleteQueryParams(
    "https://example.com/api/task/status?taskId=t1&hardDelete=maybe"
  );
  assert.equal(invalid.ok, false);
});

test("validateTaskRetryBody rejects blank taskId", () => {
  const result = validateTaskRetryBody({ taskId: "   " });
  assert.equal(result.ok, false);
});

test("isReplayableTaskType only accepts workflow task types", () => {
  assert.equal(isReplayableTaskType("image"), true);
  assert.equal(isReplayableTaskType("qa"), false);
});
