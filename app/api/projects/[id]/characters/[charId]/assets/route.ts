import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/utils";
import { saveBufferToCharacterAsset } from "@/lib/asset";
import {
  normalizeCharacterAssetRecord,
  syncCharacterAssetStatus,
} from "@/lib/workflows/character-assets";
import { normalizeCharacterAssetType } from "@/lib/studio-contracts";
import { jsonError, validateCharacterAssetUpload } from "@/lib/route-validation";

function mapAssetTypeToFolder(assetType: string): "refs" | "angles" | "expressions" | "wardrobe" {
  if (assetType === "reference-main") return "refs";
  if (assetType.startsWith("angle-")) return "angles";
  if (assetType.startsWith("expression-")) return "expressions";
  return "wardrobe";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { charId } = await params;
    const assets = await prisma.characterAsset.findMany({
      where: { characterId: charId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(assets.map(normalizeCharacterAssetRecord));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const assetType = normalizeCharacterAssetType((formData.get("assetType") as string) || "reference-main");
    const label = (formData.get("label") as string) || "";
    const tags: string[] = [];
    const tagsRaw = formData.get("tags") as string | null;
    if (tagsRaw) {
      try { tags.push(...JSON.parse(tagsRaw)); } catch { /* noop */ }
    }

    const character = await prisma.characterBible.findFirst({
      where: {
        id: charId,
        projectId,
      },
      select: { id: true },
    });
    if (!character) {
      return jsonError(404, "character_not_found", "Character was not found for the provided project");
    }

    if (!file) {
      return jsonError(400, "missing_file", "No file uploaded");
    }

    const validatedFile = await validateCharacterAssetUpload(file);
    if (!validatedFile.ok) {
      return validatedFile.response;
    }

    const { extension: ext, buffer } = validatedFile.value;
    const assetId = generateId();
    const filename = `${assetId}.${ext}`;
    const saved = saveBufferToCharacterAsset(
      buffer,
      projectId,
      charId,
      mapAssetTypeToFolder(assetType),
      filename
    );

    const asset = await prisma.characterAsset.create({
      data: {
        id: assetId,
        characterId: charId,
        assetType,
        localPath: saved.url,
        url: saved.url,
        label,
        tags: JSON.stringify(tags),
      },
    });

    await syncCharacterAssetStatus(charId);

    return NextResponse.json(normalizeCharacterAssetRecord(asset), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
