import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildCharacterAssetStatusSnapshot,
  normalizeCharacterAssetRecord,
} from "@/lib/workflows/character-assets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params;
    const character = await prisma.characterBible.findUnique({
      where: { id: charId },
      include: { assets: { orderBy: { createdAt: "asc" } } },
    });

    if (!character || character.projectId !== projectId) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const assets = character.assets.map(normalizeCharacterAssetRecord);
    const snapshot = buildCharacterAssetStatusSnapshot(assets);

    return NextResponse.json({
      characterId: charId,
      projectId,
      assetStatus: snapshot.assetStatus,
      assetSnapshot: snapshot,
      assets,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
