export interface CharacterPromptConstraints {
  names: string[];
  anchorFace: string[];
  anchorHair: string[];
  wardrobeBase: string[];
  temperamentTags: string[];
}

export interface StyleBibleConstraints {
  visualStyle?: string;
  colorStrategy?: string;
  shotPreference?: string;
  eraAesthetic?: string;
  negativeKeywords?: string;
  genreTag?: string;
}

export interface VideoPromptOptions {
  basePrompt: string;
  subjectSummary?: string;
  referenceAssetUrls?: string[];
  continuitySummary?: string;
  styleBible?: StyleBibleConstraints;
}

export function composeImagePrompt(
  basePrompt: string,
  constraints: CharacterPromptConstraints,
  styleBible?: StyleBibleConstraints
) {
  const parts = [basePrompt];

  // 视觉风格注入（必须在角色信息之前，引导整体美学方向）
  if (styleBible?.visualStyle) {
    parts.push(`art style: ${styleBible.visualStyle}`);
  }
  if (styleBible?.colorStrategy) {
    parts.push(`color palette: ${styleBible.colorStrategy}`);
  }
  if (styleBible?.eraAesthetic) {
    parts.push(`era aesthetic: ${styleBible.eraAesthetic}`);
  }

  // 角色一致性约束
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

  // 负面词拼成独立的 negative_prompt 标记（部分模型识别）
  const negativeKeywords = [
    styleBible?.negativeKeywords ?? "",
    "extra fingers, deformed hands, ugly, low quality, text overlay, split panel, collage",
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");

  return {
    prompt: parts.filter(Boolean).join(", "),
    negativePrompt: negativeKeywords,
  };
}

export function composeVideoPrompt({
  basePrompt,
  subjectSummary,
  referenceAssetUrls = [],
  continuitySummary,
  styleBible,
}: VideoPromptOptions) {
  // 过滤掉 localhost/127.0.0.1 URL：云端 API 无法访问本机文件，
  // 留在 prompt 中只会占用 token 且干扰模型对角色的理解
  const publicRefs = referenceAssetUrls.filter(
    (url) => url && !/^https?:\/\/(?:localhost|127\.0\.0\.1)/.test(url)
  );
  const refs =
    publicRefs.length > 0
      ? `reference assets: ${publicRefs.join(", ")}`
      : "";

  return [
    basePrompt,
    styleBible?.visualStyle ? `art style: ${styleBible.visualStyle}` : "",
    styleBible?.colorStrategy ? `color palette: ${styleBible.colorStrategy}` : "",
    subjectSummary ? `keep exact character identity: ${subjectSummary}` : "",
    refs,
    continuitySummary ? `continuity notes: ${continuitySummary}` : "",
    "preserve face identity, hairstyle continuity, costume continuity, stable subject identity across frames",
  ]
    .filter(Boolean)
    .join(", ");
}
