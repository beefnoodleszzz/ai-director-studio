import { NextRequest, NextResponse } from "next/server";
import { lockProjectCast } from "@/lib/workflows/story-workflow";
import { prisma } from "@/lib/prisma";
import { deriveProjectProgress } from "@/lib/production-state";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { leadCharacterId } = (await req.json()) as { leadCharacterId: string };
    if (!leadCharacterId) {
      return NextResponse.json({ error: "leadCharacterId is required" }, { status: 400 });
    }
    await lockProjectCast(projectId, leadCharacterId);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        episodes: { select: { id: true, productionStage: true } },
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

    return NextResponse.json({
      ok: true,
      progress: deriveProjectProgress(project?.episodes ?? []),
      characters: project?.characters ?? [],
      leadCharacterId: project?.characters.find((character) => character.isLead)?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
