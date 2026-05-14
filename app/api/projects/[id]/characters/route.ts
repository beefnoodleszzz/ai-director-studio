import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initCharacterDirs } from "@/lib/asset";

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
    return NextResponse.json(characters);
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
    const body = (await req.json()) as {
      name: string;
      aliases?: string;
      gender?: string;
      ageRange?: string;
      role?: string;
      // 稳定描述
      facialFeatures?: string;
      hairstyle?: string;
      bodyType?: string;
      wardrobeBase?: string;
      temperamentTags?: string;
      typicalExpressions?: string;
      typicalActions?: string;
      // 不可变锚点
      anchorFace?: string;
      anchorHair?: string;
      anchorWardrobe?: string;
      // 可变范围
      wardrobeVariants?: string;
      emotionRange?: string;
      sceneOutfits?: string;
      // 关系与 AI prompt
      relationships?: string;
      basePrompt?: string;
      // 声音档案（可选同时创建）
      voiceProfile?: {
        voiceType?: string;
        speechRate?: string;
        provider?: string;
        voiceId?: string;
        emotionStyle?: string;
      };
    };

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

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
        ...(body.voiceProfile
          ? {
              voiceProfile: {
                create: {
                  voiceType: body.voiceProfile.voiceType ?? "",
                  speechRate: body.voiceProfile.speechRate ?? "normal",
                  provider: body.voiceProfile.provider ?? "minimax",
                  voiceId: body.voiceProfile.voiceId ?? "",
                  emotionStyle: body.voiceProfile.emotionStyle ?? "",
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
