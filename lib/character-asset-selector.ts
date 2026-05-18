import { prisma } from "@/lib/prisma";
import { normalizeCharacterAssetType, type CharacterAssetType } from "@/lib/studio-contracts";

type CharacterAssetRecord = {
  assetType: string;
  localPath: string;
  label: string;
};

export interface SelectedCharacterAssets {
  referenceAssetUrls: string[];
  selectedTypes: CharacterAssetType[];
  summary: string;
}

function parseSubjectCharIds(subjectCharIdsRaw: string | null | undefined) {
  if (!subjectCharIdsRaw) return [] as string[];
  try {
    const ids = JSON.parse(subjectCharIdsRaw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function pickAngleType(cameraAngle: string | null | undefined): CharacterAssetType | null {
  switch ((cameraAngle ?? "").toLowerCase()) {
    case "low":
    case "high":
    case "dutch":
      return "angle-three-quarter";
    case "bird":
      return "angle-three-quarter";
    default:
      return "angle-left";
  }
}

function pickFallbackAngleType(cameraAngle: string | null | undefined): CharacterAssetType | null {
  switch ((cameraAngle ?? "").toLowerCase()) {
    case "low":
    case "high":
    case "dutch":
    case "bird":
      return "angle-right";
    default:
      return "angle-three-quarter";
  }
}

function pickExpressionType(emotionGoal: string | null | undefined): CharacterAssetType {
  const emotion = (emotionGoal ?? "").toLowerCase();
  if (emotion.includes("angry") || emotion.includes("rage") || emotion.includes("愤") || emotion.includes("怒")) {
    return "expression-angry";
  }
  if (emotion.includes("sad") || emotion.includes("cry") || emotion.includes("悲") || emotion.includes("哭")) {
    return "expression-sad";
  }
  if (emotion.includes("surprise") || emotion.includes("shock") || emotion.includes("惊")) {
    return "expression-surprised";
  }
  return "expression-neutral";
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items));
}

function chooseAssetsForCharacter(
  assets: CharacterAssetRecord[],
  cameraAngle: string,
  emotionGoal: string
) {
  const normalized = assets.map((asset) => ({
    ...asset,
    assetType: normalizeCharacterAssetType(asset.assetType),
  }));

  const byType = new Map<CharacterAssetType, CharacterAssetRecord[]>();
  for (const asset of normalized) {
    const current = byType.get(asset.assetType) ?? [];
    current.push(asset);
    byType.set(asset.assetType, current);
  }

  const selectedTypes = [
    "reference-main" as const,
    pickAngleType(cameraAngle),
    pickFallbackAngleType(cameraAngle),
    pickExpressionType(emotionGoal),
  ].filter(Boolean) as CharacterAssetType[];

  const selectedAssets = selectedTypes.flatMap((type) => byType.get(type) ?? []).slice(0, 4);
  const urls = dedupe(selectedAssets.map((asset) => asset.localPath).filter(Boolean));

  return {
    referenceAssetUrls: urls,
    selectedTypes: dedupe(selectedTypes),
  };
}

export async function selectCharacterAssetsForShot(input: {
  subjectCharIdsRaw: string | null | undefined;
  cameraAngle: string;
  emotionGoal: string;
}) {
  const ids = parseSubjectCharIds(input.subjectCharIdsRaw);
  if (!ids.length) {
    return {
      referenceAssetUrls: [],
      selectedTypes: [] as CharacterAssetType[],
      summary: "",
    } satisfies SelectedCharacterAssets;
  }

  const characters = await prisma.characterBible.findMany({
    where: { id: { in: ids } },
    include: {
      assets: {
        orderBy: { createdAt: "asc" },
        select: {
          assetType: true,
          localPath: true,
          label: true,
        },
      },
    },
  });

  const selected = characters.map((character) => ({
    characterName: character.name,
    ...chooseAssetsForCharacter(character.assets, input.cameraAngle, input.emotionGoal),
  }));

  const referenceAssetUrls = dedupe(selected.flatMap((item) => item.referenceAssetUrls)).slice(0, 6);
  const selectedTypes = dedupe(selected.flatMap((item) => item.selectedTypes));
  const summary = selected
    .map((item) =>
      `${item.characterName}: ${item.selectedTypes.join(", ")}`
    )
    .join(" | ");

  return {
    referenceAssetUrls,
    selectedTypes,
    summary,
  } satisfies SelectedCharacterAssets;
}
