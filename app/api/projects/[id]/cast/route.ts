import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function buildCastPayload(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      productionStage: true,
      storyOutline: true,
      characters: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          isLead: true,
          dramaticGoal: true,
          conflictRole: true,
          relationshipSummary: true,
          arcSummary: true,
          basePrompt: true,
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  return {
    id: project.id,
    productionStage: project.productionStage,
    storyOutline: project.storyOutline,
    leadCharacterId: project.characters.find((character) => character.isLead)?.id ?? null,
    characters: project.characters,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const payload = await buildCastPayload(projectId);

    if (!payload) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = (await req.json()) as {
      leadCharacterId?: string;
      productionStage?: string;
      characters?: Array<{
        id: string;
        role?: string;
        dramaticGoal?: string;
        conflictRole?: string;
        relationshipSummary?: string;
        arcSummary?: string;
        basePrompt?: string;
        isLead?: boolean;
      }>;
    };

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, characters: { select: { id: true } } },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectCharacterIds = new Set(project.characters.map((character) => character.id));
    const explicitLeadId =
      body.leadCharacterId ??
      body.characters?.find((character) => character.isLead)?.id;

    await prisma.$transaction(async (tx) => {
      if (body.characters?.length) {
        for (const character of body.characters) {
          if (!projectCharacterIds.has(character.id)) {
            throw new Error(`Character ${character.id} does not belong to project ${projectId}`);
          }

          await tx.characterBible.update({
            where: { id: character.id },
            data: {
              ...(character.role !== undefined ? { role: character.role } : {}),
              ...(character.dramaticGoal !== undefined ? { dramaticGoal: character.dramaticGoal } : {}),
              ...(character.conflictRole !== undefined ? { conflictRole: character.conflictRole } : {}),
              ...(character.relationshipSummary !== undefined
                ? { relationshipSummary: character.relationshipSummary }
                : {}),
              ...(character.arcSummary !== undefined ? { arcSummary: character.arcSummary } : {}),
              ...(character.basePrompt !== undefined ? { basePrompt: character.basePrompt } : {}),
            },
          });
        }
      }

      if (explicitLeadId) {
        if (!projectCharacterIds.has(explicitLeadId)) {
          throw new Error(`Lead character ${explicitLeadId} does not belong to project ${projectId}`);
        }

        await tx.characterBible.updateMany({
          where: { projectId },
          data: { isLead: false },
        });
        await tx.characterBible.update({
          where: { id: explicitLeadId },
          data: { isLead: true },
        });
      }

      if (body.productionStage) {
        await tx.project.update({
          where: { id: projectId },
          data: { productionStage: body.productionStage },
        });
      }
    });

    const payload = await buildCastPayload(projectId);
    if (!payload) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
