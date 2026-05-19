import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAssembleBody,
  validateBatchImageGenerationBody,
  validateBatchRetryBody,
  validateCastPatchBody,
  validateCharacterCreateBody,
  validateCharacterPatchBody,
  validateEpisodeUpdateBody,
  validateImageGenerationBody,
  validateOutlinePatchBody,
  validateProjectCreateBody,
  validateQaReviewPatchBody,
  validateScriptBreakdownBody,
  validateShotAdoptBody,
  validateShotDialoguePatchBody,
  validateShotPatchBody,
  validateStyleBibleUpsertBody,
  validateTaskRetryBody,
  validateTakePatchBody,
  validateVideoGenerationBody,
} from "@/lib/route-validation";

test("validateImageGenerationBody rejects malformed candidateCount", () => {
  const result = validateImageGenerationBody({
    projectId: "p1",
    episodeId: "e1",
    sceneId: "s1",
    shotId: "sh1",
    candidateCount: 9,
  });

  assert.equal(result.ok, false);
});

test("validateVideoGenerationBody accepts valid payload", () => {
  const result = validateVideoGenerationBody({
    projectId: "p1",
    episodeId: "e1",
    sceneId: "s1",
    shotId: "sh1",
    adoptedImageTakeId: "take1",
    stopOnQaFail: true,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.adoptedImageTakeId, "take1");
    assert.equal(result.value.stopOnQaFail, true);
  }
});

test("validateTaskRetryBody rejects blank taskId", () => {
  const result = validateTaskRetryBody({ taskId: "   " });
  assert.equal(result.ok, false);
});

test("validateAssembleBody accepts preview payload with minResolution", () => {
  const result = validateAssembleBody({
    projectId: "p1",
    episodeId: "e1",
    previewOnly: true,
    aspect: "9:16",
    minResolution: {
      width: 720,
      height: 1280,
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.previewOnly, true);
    assert.deepEqual(result.value.minResolution, { width: 720, height: 1280 });
  }
});

test("validateScriptBreakdownBody allows pendingData without script", () => {
  const result = validateScriptBreakdownBody({
    projectId: "p1",
    episodeId: "e1",
    pendingData: {
      scenes: [],
      castCandidates: [],
    },
  });

  assert.equal(result.ok, true);
});

test("validateBatchImageGenerationBody rejects conflicting candidate aliases", () => {
  const result = validateBatchImageGenerationBody({
    candidateCount: 1,
    nCandidates: 2,
  });

  assert.equal(result.ok, false);
});

test("validateBatchRetryBody rejects empty takeIds", () => {
  const result = validateBatchRetryBody({ takeIds: [] });
  assert.equal(result.ok, false);
});

test("validateProjectCreateBody rejects invalid aspect", () => {
  const result = validateProjectCreateBody({
    title: "demo",
    aspect: "1:1",
  });

  assert.equal(result.ok, false);
});

test("validateStyleBibleUpsertBody rejects non-string fields", () => {
  const result = validateStyleBibleUpsertBody({
    genreTag: "xianxia",
    imageDensity: 2,
  });

  assert.equal(result.ok, false);
});

test("validateCastPatchBody accepts partial character edits", () => {
  const result = validateCastPatchBody({
    leadCharacterId: "char-1",
    characters: [
      {
        id: "char-1",
        role: "lead",
        isLead: true,
      },
    ],
  });

  assert.equal(result.ok, true);
});

test("validateOutlinePatchBody rejects primitive storyOutline", () => {
  const result = validateOutlinePatchBody({
    storyOutline: "bad",
  });

  assert.equal(result.ok, false);
});

test("validateCharacterPatchBody accepts voice profile updates", () => {
  const result = validateCharacterPatchBody({
    name: "沈清秋",
    isLead: true,
    voiceProfile: {
      provider: "doubao-tts",
      volume: 1.25,
    },
  });

  assert.equal(result.ok, true);
});

test("validateEpisodeUpdateBody rejects invalid production stage", () => {
  const result = validateEpisodeUpdateBody({
    productionStage: "done",
  });

  assert.equal(result.ok, false);
});

test("validateCharacterCreateBody requires name", () => {
  const result = validateCharacterCreateBody({
    basePrompt: "hero portrait",
  });

  assert.equal(result.ok, false);
});

test("validateQaReviewPatchBody rejects invalid verdict", () => {
  const result = validateQaReviewPatchBody({
    reviewId: "r1",
    verdict: "pending",
  });

  assert.equal(result.ok, false);
});

test("validateShotPatchBody rejects non-boolean clearBlock", () => {
  const result = validateShotPatchBody({
    clearBlock: "yes",
  });

  assert.equal(result.ok, false);
});

test("validateTakePatchBody accepts discard flag", () => {
  const result = validateTakePatchBody({
    isDiscarded: true,
    discardReason: "blurred face",
  });

  assert.equal(result.ok, true);
});

test("validateShotAdoptBody rejects invalid takeType", () => {
  const result = validateShotAdoptBody({
    takeId: "t1",
    takeType: "frame",
  });

  assert.equal(result.ok, false);
});

test("validateShotDialoguePatchBody requires paired sentence patch fields", () => {
  const result = validateShotDialoguePatchBody({
    sentenceIndex: 1,
  });

  assert.equal(result.ok, false);
});
