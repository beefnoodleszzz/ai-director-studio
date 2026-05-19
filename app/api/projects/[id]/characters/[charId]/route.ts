import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removeCharacterAssetDirs } from "@/lib/asset";
import {
  buildCharacterAssetStatusSnapshot,
  normalizeCharacterAssetRecord,
} from "@/lib/workflows/character-assets";
import { validateCharacterPatchBody } from "@/lib/route-validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params;
    const parsed = validateCharacterPatchBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

    const existing = await prisma.characterBible.findFirst({
      where: { id: charId, projectId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    await prisma.characterBible.update({
      where: { id: charId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.aliases !== undefined ? { aliases: body.aliases } : {}),
        ...(body.gender !== undefined ? { gender: body.gender } : {}),
        ...(body.ageRange !== undefined ? { ageRange: body.ageRange } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.facialFeatures !== undefined ? { facialFeatures: body.facialFeatures } : {}),
        ...(body.hairstyle !== undefined ? { hairstyle: body.hairstyle } : {}),
        ...(body.bodyType !== undefined ? { bodyType: body.bodyType } : {}),
        ...(body.wardrobeBase !== undefined ? { wardrobeBase: body.wardrobeBase } : {}),
        ...(body.temperamentTags !== undefined ? { temperamentTags: body.temperamentTags } : {}),
        ...(body.typicalExpressions !== undefined ? { typicalExpressions: body.typicalExpressions } : {}),
        ...(body.typicalActions !== undefined ? { typicalActions: body.typicalActions } : {}),
        ...(body.anchorFace !== undefined ? { anchorFace: body.anchorFace } : {}),
        ...(body.anchorHair !== undefined ? { anchorHair: body.anchorHair } : {}),
        ...(body.anchorWardrobe !== undefined ? { anchorWardrobe: body.anchorWardrobe } : {}),
        ...(body.wardrobeVariants !== undefined ? { wardrobeVariants: body.wardrobeVariants } : {}),
        ...(body.emotionRange !== undefined ? { emotionRange: body.emotionRange } : {}),
        ...(body.sceneOutfits !== undefined ? { sceneOutfits: body.sceneOutfits } : {}),
        ...(body.relationships !== undefined ? { relationships: body.relationships } : {}),
        ...(body.basePrompt !== undefined ? { basePrompt: body.basePrompt } : {}),
        ...(body.isLead !== undefined ? { isLead: body.isLead } : {}),
        ...(body.dramaticGoal !== undefined ? { dramaticGoal: body.dramaticGoal } : {}),
        ...(body.conflictRole !== undefined ? { conflictRole: body.conflictRole } : {}),
        ...(body.relationshipSummary !== undefined ? { relationshipSummary: body.relationshipSummary } : {}),
        ...(body.arcSummary !== undefined ? { arcSummary: body.arcSummary } : {}),
      },
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
    const { id: projectId, charId } = await params;
    const character = await prisma.characterBible.findFirst({
      where: { id: charId, projectId },
      select: { id: true, projectId: true },
    });
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    await prisma.characterBible.delete({ where: { id: charId } });
    removeCharacterAssetDirs(character.projectId, character.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE character]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
