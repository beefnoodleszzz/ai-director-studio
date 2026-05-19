import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removePublicUrlIfExists } from "@/lib/asset";
import {
  normalizeCharacterAssetRecord,
  syncCharacterAssetStatus,
} from "@/lib/workflows/character-assets";
import { normalizeCharacterAssetType } from "@/lib/studio-contracts";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string; assetId: string }> }
) {
  try {
    const { id: projectId, assetId, charId } = await params;

    const asset = await prisma.characterAsset.findFirst({
      where: {
        id: assetId,
        characterId: charId,
        character: { projectId },
      },
    });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

    removePublicUrlIfExists(asset.localPath);
    await prisma.characterAsset.delete({ where: { id: assetId } });
    await syncCharacterAssetStatus(charId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string; assetId: string }> }
) {
  try {
    const { id: projectId, charId, assetId } = await params;
    const existing = await prisma.characterAsset.findFirst({
      where: {
        id: assetId,
        characterId: charId,
        character: { projectId },
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const updated = await prisma.characterAsset.update({
      where: { id: existing.id },
      data: {
        label: body.label,
        assetType: body.assetType ? normalizeCharacterAssetType(body.assetType) : undefined,
        tags: body.tags ? JSON.stringify(body.tags) : undefined,
      },
    });
    await syncCharacterAssetStatus(updated.characterId);
    return NextResponse.json(normalizeCharacterAssetRecord(updated));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
