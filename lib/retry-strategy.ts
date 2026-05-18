export interface RetryStrategy {
  promptHints: string[];
  preferredAssetTypes: string[];
  disableContinuityReference?: boolean;
}

export function deriveRetryStrategyFromFailTags(failTags: string[]): RetryStrategy {
  const tagSet = new Set(failTags);
  const promptHints: string[] = [];
  const preferredAssetTypes: string[] = [];
  let disableContinuityReference = false;

  if (tagSet.has("wrong-expression")) {
    promptHints.push("strictly match the target facial expression from the selected expression reference");
    preferredAssetTypes.push("expression-neutral", "expression-angry", "expression-sad", "expression-surprised");
  }

  if (tagSet.has("wrong-angle-reference")) {
    promptHints.push("strictly follow the requested camera angle and use the matching angle reference");
    preferredAssetTypes.push("angle-left", "angle-right", "angle-three-quarter");
  }

  if (tagSet.has("face-inconsistency") || tagSet.has("hairstyle-change") || tagSet.has("wardrobe-drift")) {
    promptHints.push("lock face identity, hairstyle, and costume motifs much more strictly");
    preferredAssetTypes.push("reference-main");
  }

  if (tagSet.has("continuity-break")) {
    promptHints.push("reduce transition jump and preserve action/emotion carry-over from the previous shot");
    disableContinuityReference = false;
  }

  if (tagSet.has("temporal-inconsistency")) {
    promptHints.push("simplify motion and keep subject identity stable frame to frame");
  }

  return {
    promptHints,
    preferredAssetTypes: Array.from(new Set(preferredAssetTypes)),
    disableContinuityReference,
  };
}
