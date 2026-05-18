import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildCharacterAssetStatusSnapshot,
  normalizeCharacterAssetRecord,
} from "@/lib/workflows/character-assets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { charId } = await params;
    const body = (await req.json()) as Record<string, unknown> & {
      voiceProfile?: Record<string, unknown>;
    };
    const allowedCharacterFields = [
      "name",
      "aliases",
      "gender",
      "ageRange",
      "role",
      "facialFeatures",
      "hairstyle",
      "bodyType",
      "wardrobeBase",
      "temperamentTags",
      "typicalExpressions",
      "typicalActions",
      "anchorFace",
      "anchorHair",
      "anchorWardrobe",
      "wardrobeVariants",
      "emotionRange",
      "sceneOutfits",
      "relationships",
      "basePrompt",
      "isLead",
      "dramaticGoal",
      "conflictRole",
      "relationshipSummary",
      "arcSummary",
    ] as const;

    const charData = Object.fromEntries(
      allowedCharacterFields
        .filter((field) => body[field] !== undefined)
        .map((field) => [field, body[field]])
    );

    await prisma.characterBible.update({
      where: { id: charId },
      data: charData,
      include: { voiceProfile: true, assets: true },
    });

    if (body.voiceProfile) {
      await prisma.voiceProfile.upsert({
        where: { characterId: charId },
        create: { characterId: charId, ...body.voiceProfile },
        update: body.voiceProfile,
      });
    }

    const refreshed = await prisma.characterBible.findUnique({
      where: { id: charId },
      include: { voiceProfile: true, assets: true },
    });

    if (!refreshed) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const normalizedAssets = refreshed.assets.map(normalizeCharacterAssetRecord);
    const assetSnapshot = buildCharacterAssetStatusSnapshot(normalizedAssets);

    return NextResponse.json({
      ...refreshed,
      assetStatus: assetSnapshot.assetStatus,
      assetSnapshot,
      assets: normalizedAssets,
    });
  } catch (err) {
    console.error("[PATCH /api/projects/:id/characters/:charId]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { charId } = await params;
    await prisma.characterBible.delete({ where: { id: charId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE character]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
