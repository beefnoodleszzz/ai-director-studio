import axios from "axios";
import { prisma } from "@/lib/prisma";
import {
  CHARACTER_ASSET_READY_TYPES,
  type CharacterAssetStatus,
  normalizeCharacterAssetType,
  inferCharacterAssetStatus,
} from "@/lib/studio-contracts";
import { downloadCharacterAsset, saveBase64ToCharacterAsset } from "@/lib/asset";
import { generateId } from "@/lib/utils";

type CharacterAssetRecord = {
  id: string;
  characterId: string;
  assetType: string;
  label: string;
  localPath: string;
  url: string;
  tags: string;
  createdAt: Date;
};

export interface CharacterAssetStatusSnapshot {
  assetStatus: CharacterAssetStatus;
  completenessRatio: number;
  presentTypes: string[];
  missingTypes: string[];
  generatedTypes: string[];
  totalAssets: number;
}

export interface GeneratedCharacterAssetPack {
  assetStatus: CharacterAssetStatus;
  createdAssets: CharacterAssetRecord[];
  reusedAssets: CharacterAssetRecord[];
  snapshot: CharacterAssetStatusSnapshot;
}

interface CharacterImageProviderResult {
  imageUrl: string;
  base64?: string;
}

interface CharacterImageProvider {
  name: string;
  generate(prompt: string, refImageUrls?: string[]): Promise<CharacterImageProviderResult>;
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function buildGeneratedTags(assetType: string, tagsRaw: string) {
  let tags: string[] = [];
  try {
    tags = JSON.parse(tagsRaw) as string[];
  } catch {
    tags = [];
  }

  return JSON.stringify(dedupe(["generated-core-pack", assetType, ...tags]));
}

function buildGeneratedLabel(characterName: string, assetType: string) {
  const suffix = assetType.replace(/^reference-main$/, "reference");
  return `${characterName}-${suffix}`;
}

function isVolcengineArkBaseUrl(baseUrl: string) {
  return baseUrl.includes("volces.com") || baseUrl.includes("ark.cn-beijing");
}

class SeedreamCharacterProvider implements CharacterImageProvider {
  name = "seedream";

  async generate(prompt: string, refImageUrls?: string[]) {
    const apiKey = process.env.SEEDREAM_API_KEY;
    const baseUrl = process.env.SEEDREAM_BASE_URL ?? "https://api.seedream.io/v1";
    if (!apiKey) throw new Error("SEEDREAM_API_KEY is not configured");

    const isArk = isVolcengineArkBaseUrl(baseUrl);
    const body: Record<string, unknown> = { prompt, aspect_ratio: "9:16" };

    if (isArk) {
      const model = process.env.IMAGE_MODEL ?? process.env.SEEDREAM_MODEL;
      if (!model) {
        throw new Error(
          "使用火山方舟地址时必须在环境变量中配置 IMAGE_MODEL（或 SEEDREAM_MODEL），例如 doubao-seedream-4.5"
        );
      }
      body.model = model;
      body.response_format = "url";
      if (refImageUrls && refImageUrls.length > 0) {
        body.image = refImageUrls.length === 1 ? refImageUrls[0] : refImageUrls;
      }
    } else if (refImageUrls && refImageUrls.length > 0) {
      body.image_url = refImageUrls[0];
    }

    const response = await axios.post(`${baseUrl}/images/generations`, body, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120_000,
    });

    const imageUrl: string =
      response.data?.data?.[0]?.url ??
      response.data?.images?.[0]?.url ??
      response.data?.output?.images?.[0];

    if (!imageUrl) throw new Error("Seedream returned no image URL");
    return { imageUrl };
  }
}

const CHARACTER_IMAGE_PROVIDERS: Record<string, CharacterImageProvider> = {
  seedream: new SeedreamCharacterProvider(),
};

function getCharacterImageProvider(name?: string): CharacterImageProvider {
  const key = name ?? process.env.IMAGE_PROVIDER ?? "seedream";
  const provider = CHARACTER_IMAGE_PROVIDERS[key];
  if (!provider) throw new Error(`Unknown character image provider: ${key}`);
  return provider;
}

function mapAssetTypeToFolder(assetType: string): "refs" | "angles" | "expressions" | "wardrobe" {
  if (assetType === "reference-main") return "refs";
  if (assetType.startsWith("angle-")) return "angles";
  if (assetType.startsWith("expression-")) return "expressions";
  return "wardrobe";
}

function buildCharacterAssetPrompt(character: Awaited<ReturnType<typeof prisma.characterBible.findUnique>> extends infer T ? T : never, assetType: string) {
  if (!character) return "";
  const baseIdentity = [
    character.basePrompt,
    character.anchorFace ? `must keep face identity: ${character.anchorFace}` : "",
    character.anchorHair ? `must keep hairstyle and hair color: ${character.anchorHair}` : "",
    character.anchorWardrobe ? `must keep wardrobe motif: ${character.anchorWardrobe}` : "",
    character.wardrobeBase ? `wardrobe baseline: ${character.wardrobeBase}` : "",
    character.temperamentTags ? `temperament: ${character.temperamentTags}` : "",
  ].filter(Boolean).join(", ");

  const assetDirectiveMap: Record<string, string> = {
    "reference-main": "character reference portrait, front-facing, clean studio lighting, single subject, highly consistent identity",
    "angle-left": "left side profile portrait, keep exact same identity, same hairstyle, same costume details",
    "angle-right": "right side profile portrait, keep exact same identity, same hairstyle, same costume details",
    "angle-three-quarter": "three-quarter portrait, cinematic reference sheet angle, consistent face and costume",
    "expression-neutral": "neutral expression portrait, calm eyes, reference sheet quality, consistent identity",
    "expression-angry": "angry expression portrait, brows tense, strong emotion but stable face identity",
    "expression-sad": "sad expression portrait, teary eyes, soft sadness, stable identity and costume",
    "expression-surprised": "surprised expression portrait, widened eyes, open reaction, stable identity and costume",
  };

  return [
    `${character.name}, ${baseIdentity}`,
    assetDirectiveMap[assetType] ?? "character reference image, stable identity",
    "ultra detailed, production-ready character sheet, no extra people, no text, no collage, no split panels",
  ].join(", ");
}

export function normalizeCharacterAssetRecord<T extends { assetType: string }>(asset: T): T & { assetType: string } {
  return {
    ...asset,
    assetType: normalizeCharacterAssetType(asset.assetType),
  };
}

export function buildCharacterAssetStatusSnapshot(
  assets: Array<{ assetType: string }>
): CharacterAssetStatusSnapshot {
  const presentTypes = dedupe(assets.map((asset) => normalizeCharacterAssetType(asset.assetType)));
  const missingTypes = CHARACTER_ASSET_READY_TYPES.filter((type) => !presentTypes.includes(type));
  const assetStatus = inferCharacterAssetStatus(presentTypes);
  const readyTypeSet = new Set<string>(CHARACTER_ASSET_READY_TYPES);

  return {
    assetStatus,
    completenessRatio: (CHARACTER_ASSET_READY_TYPES.length - missingTypes.length) / CHARACTER_ASSET_READY_TYPES.length,
    presentTypes,
    missingTypes,
    generatedTypes: presentTypes.filter((type) => readyTypeSet.has(type)),
    totalAssets: assets.length,
  };
}

export async function syncCharacterAssetStatus(characterId: string) {
  const assets = await prisma.characterAsset.findMany({
    where: { characterId },
    select: { assetType: true },
  });

  const snapshot = buildCharacterAssetStatusSnapshot(assets);

  await prisma.characterBible.update({
    where: { id: characterId },
    data: { assetStatus: snapshot.assetStatus },
  });

  return snapshot;
}

export async function generateCharacterCoreAssetPack(projectId: string, characterId: string): Promise<GeneratedCharacterAssetPack> {
  const character = await prisma.characterBible.findUnique({
    where: { id: characterId },
    include: {
      assets: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!character || character.projectId !== projectId) {
    throw new Error("Character not found");
  }

  const normalizedAssets = character.assets.map(normalizeCharacterAssetRecord);
  const presentTypes = new Set(normalizedAssets.map((asset) => asset.assetType));
  const seedAsset =
    normalizedAssets.find((asset) => asset.assetType === "reference-main") ??
    normalizedAssets.find((asset) => asset.assetType !== "other") ??
    normalizedAssets[0];

  if (!seedAsset) {
    throw new Error("At least one reference asset is required before generating the core pack");
  }

  const missingTypes = CHARACTER_ASSET_READY_TYPES.filter((type) => !presentTypes.has(type));
  const createdAssets: CharacterAssetRecord[] = [];
  const imageProvider = getCharacterImageProvider();
  const referenceUrls = normalizedAssets
    .filter((asset) => asset.assetType !== "other")
    .map((asset) => asset.localPath)
    .filter(Boolean)
    .slice(0, 4);

  for (const assetType of missingTypes) {
    const prompt = buildCharacterAssetPrompt(character, assetType);
    const generation = await imageProvider.generate(prompt, referenceUrls);
    const fileId = generateId();
    const fileName = `${assetType}-${fileId}.jpg`;
    const folder = mapAssetTypeToFolder(assetType);
    const saved = generation.base64
      ? saveBase64ToCharacterAsset(generation.base64, projectId, characterId, folder, fileName)
      : await downloadCharacterAsset(generation.imageUrl, projectId, characterId, folder, fileName);
    const created = await prisma.characterAsset.create({
      data: {
        characterId,
        assetType,
        label: buildGeneratedLabel(character.name, assetType),
        localPath: saved.url,
        url: saved.url,
        tags: buildGeneratedTags(assetType, seedAsset.tags),
      },
    });
    createdAssets.push(created);
  }

  const snapshot = await syncCharacterAssetStatus(characterId);

  return {
    assetStatus: snapshot.assetStatus,
    createdAssets,
    reusedAssets: normalizedAssets.filter((asset) =>
      new Set<string>(CHARACTER_ASSET_READY_TYPES).has(asset.assetType)
    ),
    snapshot,
  };
}
