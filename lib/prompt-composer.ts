export interface CharacterPromptConstraints {
  names: string[];
  anchorFace: string[];
  anchorHair: string[];
  wardrobeBase: string[];
  temperamentTags: string[];
}

export interface VideoPromptOptions {
  basePrompt: string;
  subjectSummary?: string;
  referenceAssetUrls?: string[];
  continuitySummary?: string;
}

export function composeImagePrompt(
  basePrompt: string,
  constraints: CharacterPromptConstraints
) {
  const parts = [basePrompt];

  if (constraints.names.length > 0) {
    parts.push(`characters: ${constraints.names.join(", ")}`);
  }
  if (constraints.anchorFace.length > 0) {
    parts.push(`keep facial identity: ${constraints.anchorFace.join("; ")}`);
  }
  if (constraints.anchorHair.length > 0) {
    parts.push(`consistent hairstyle: ${constraints.anchorHair.join("; ")}`);
  }
  if (constraints.wardrobeBase.length > 0) {
    parts.push(`wardrobe consistency: ${constraints.wardrobeBase.join("; ")}`);
  }
  if (constraints.temperamentTags.length > 0) {
    parts.push(
      `character aura: ${Array.from(new Set(constraints.temperamentTags)).join(", ")}`
    );
  }

  parts.push(
    "high identity consistency, same character design, stable face, stable costume"
  );

  return parts.filter(Boolean).join(", ");
}

export function composeVideoPrompt({
  basePrompt,
  subjectSummary,
  referenceAssetUrls = [],
  continuitySummary,
}: VideoPromptOptions) {
  const refs =
    referenceAssetUrls.length > 0
      ? `reference assets: ${referenceAssetUrls.join(", ")}`
      : "";

  return [
    basePrompt,
    subjectSummary ? `keep exact character identity: ${subjectSummary}` : "",
    refs,
    continuitySummary ? `continuity notes: ${continuitySummary}` : "",
    "preserve face identity, hairstyle continuity, costume continuity, stable subject identity across frames",
  ]
    .filter(Boolean)
    .join(", ");
}
