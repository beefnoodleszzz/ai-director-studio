import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initCharacterDirs } from "@/lib/asset";
import {
  buildCharacterAssetStatusSnapshot,
  normalizeCharacterAssetRecord,
} from "@/lib/workflows/character-assets";
import { validateCharacterCreateBody } from "@/lib/route-validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const characters = await prisma.characterBible.findMany({
      where: { projectId },
      include: { voiceProfile: true, assets: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(
      characters.map((character) => {
        const assets = character.assets.map(normalizeCharacterAssetRecord);
        const snapshot = buildCharacterAssetStatusSnapshot(assets);
        return {
          ...character,
          assetStatus: snapshot.assetStatus,
          assetSnapshot: snapshot,
          assets,
        };
      })
    );
  } catch (err) {
    console.error("[GET /api/projects/:id/characters]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const parsed = validateCharacterCreateBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

    const character = await prisma.characterBible.create({
      data: {
        projectId,
        name: body.name,
        aliases: body.aliases ?? "",
        gender: body.gender ?? "",
        ageRange: body.ageRange ?? "",
        role: body.role ?? "",
        facialFeatures: body.facialFeatures ?? "",
        hairstyle: body.hairstyle ?? "",
        bodyType: body.bodyType ?? "",
        wardrobeBase: body.wardrobeBase ?? "",
        temperamentTags: body.temperamentTags ?? "",
        typicalExpressions: body.typicalExpressions ?? "",
        typicalActions: body.typicalActions ?? "",
        anchorFace: body.anchorFace ?? "",
        anchorHair: body.anchorHair ?? "",
        anchorWardrobe: body.anchorWardrobe ?? "",
        wardrobeVariants: body.wardrobeVariants ?? "",
        emotionRange: body.emotionRange ?? "",
        sceneOutfits: body.sceneOutfits ?? "",
        relationships: body.relationships ?? "",
        basePrompt: body.basePrompt ?? "",
        isLead: body.isLead ?? false,
        dramaticGoal: body.dramaticGoal ?? "",
        conflictRole: body.conflictRole ?? "",
        relationshipSummary: body.relationshipSummary ?? "",
        arcSummary: body.arcSummary ?? "",
        ...(body.voiceProfile
          ? {
              voiceProfile: {
                create: {
                  voiceType: body.voiceProfile.voiceType ?? "",
                  ageFeeling: body.voiceProfile.ageFeeling ?? "",
                  emotionStyle: body.voiceProfile.emotionStyle ?? "",
                  speechRate: body.voiceProfile.speechRate ?? "normal",
                  pauseStyle: body.voiceProfile.pauseStyle ?? "",
                  volume: body.voiceProfile.volume ?? 1,
                  languageStyle: body.voiceProfile.languageStyle ?? "",
                  provider: body.voiceProfile.provider ?? "doubao-tts",
                  voiceId: body.voiceProfile.voiceId ?? "",
                  extraParams: body.voiceProfile.extraParams ?? "",
                },
              },
            }
          : {}),
      },
      include: { voiceProfile: true, assets: true },
    });

    initCharacterDirs(projectId, character.id);

    return NextResponse.json(character, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects/:id/characters]", err);
    return NextResponse.json({ error: "Failed to create character" }, { status: 500 });
  }
}
