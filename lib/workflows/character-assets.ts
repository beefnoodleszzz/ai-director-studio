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
import {
  DEFAULT_IMAGE_PROVIDER,
  buildImageGenerationBody,
  extractGeneratedImage,
  resolveImageProviderConfig,
  resolveImageRequestTimeoutMs,
} from "@/lib/image-api";

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

interface GenerateCharacterAssetPackOptions {
  assetTypes?: string[];
  limit?: number;
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

class SakuraCharacterProvider implements CharacterImageProvider {
  name = DEFAULT_IMAGE_PROVIDER;

  async generate(prompt: string, _refImageUrls?: string[]) {
    void _refImageUrls;

    const { apiKey, baseUrl } = resolveImageProviderConfig();
    if (!apiKey) throw new Error("IMAGE_API_KEY is not configured");

    const body = buildImageGenerationBody(prompt, {
      aspectRatio: process.env.CHARACTER_IMAGE_ASPECT_RATIO ?? "1:1",
    });

    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await axios.post(`${baseUrl}/images/generations`, body, {
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          timeout: resolveImageRequestTimeoutMs(),
        });

        return extractGeneratedImage(response.data);
      } catch (e) {
        lastError = e;

        if (axios.isAxiosError(e) && e.response) {
          const detail =
            typeof e.response.data === "object"
              ? JSON.stringify(e.response.data)
              : String(e.response.data);
          const code = e.response.headers["x-error-code"] ?? e.response.headers["x-request-id"];
          const message =
            `Sakura image API HTTP ${e.response.status}${code ? ` (${String(code)})` : ""}: ${detail}`;

          if (attempt < 2 && e.response.status === 524) {
            continue;
          }

          throw new Error(message);
        }

        if (attempt === 2) {
          throw e;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Character image generation failed");
  }
}

const sakuraCharacterProvider = new SakuraCharacterProvider();
const CHARACTER_IMAGE_PROVIDERS: Record<string, CharacterImageProvider> = {
  [DEFAULT_IMAGE_PROVIDER]: sakuraCharacterProvider,
  seedream: sakuraCharacterProvider,
};

function getCharacterImageProvider(name?: string): CharacterImageProvider {
  const key = name ?? process.env.IMAGE_PROVIDER ?? DEFAULT_IMAGE_PROVIDER;
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
  return generateCharacterCoreAssetPackWithOptions(projectId, characterId);
}

function normalizeRequestedAssetTypes(assetTypes?: string[]) {
  if (!assetTypes?.length) return [];

  return dedupe(
    assetTypes
      .map((assetType) => normalizeCharacterAssetType(assetType))
      .filter((assetType) =>
        CHARACTER_ASSET_READY_TYPES.includes(
          assetType as (typeof CHARACTER_ASSET_READY_TYPES)[number]
        )
      )
  );
}

export async function generateCharacterCoreAssetPackWithOptions(
  projectId: string,
  characterId: string,
  options?: GenerateCharacterAssetPackOptions
): Promise<GeneratedCharacterAssetPack> {
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
  const imageProvider = getCharacterImageProvider();
  let ensuredSeedAsset = seedAsset;
  const createdAssets: CharacterAssetRecord[] = [];

  if (!ensuredSeedAsset) {
    const seedPrompt = buildCharacterAssetPrompt(character, "reference-main");
    const seedGeneration = await imageProvider.generate(seedPrompt);
    const fileId = generateId();
    const fileName = `reference-main-${fileId}.jpg`;
    const saved = seedGeneration.base64
      ? saveBase64ToCharacterAsset(seedGeneration.base64, projectId, characterId, "refs", fileName)
      : await downloadCharacterAsset(seedGeneration.imageUrl, projectId, characterId, "refs", fileName);
    ensuredSeedAsset = await prisma.characterAsset.create({
      data: {
        characterId,
        assetType: "reference-main",
        label: buildGeneratedLabel(character.name, "reference-main"),
        localPath: saved.url,
        url: saved.url,
        tags: JSON.stringify(["generated-seed", "reference-main"]),
      },
    });
    createdAssets.push(ensuredSeedAsset);
    normalizedAssets.push(normalizeCharacterAssetRecord(ensuredSeedAsset));
    presentTypes.add("reference-main");
  }

  const requestedTypes = normalizeRequestedAssetTypes(options?.assetTypes);
  const missingTypesSource =
    requestedTypes.length > 0
      ? requestedTypes.filter((type) => !presentTypes.has(type))
      : CHARACTER_ASSET_READY_TYPES.filter((type) => !presentTypes.has(type));
  const batchLimit =
    typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : missingTypesSource.length;
  const missingTypes = missingTypesSource.slice(0, batchLimit);
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
        tags: buildGeneratedTags(assetType, ensuredSeedAsset.tags),
      },
    });
    createdAssets.push(created);
    referenceUrls.push(saved.url);
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
