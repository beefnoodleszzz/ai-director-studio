import { NextRequest, NextResponse } from "next/server";
import { generateProjectCast } from "@/lib/workflows/story-workflow";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const result = await generateProjectCast(projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
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
    return NextResponse.json({
      ...result,
      productionStage: project?.productionStage ?? "idea",
      storyOutline: project?.storyOutline ?? "",
      characters: project?.characters ?? [],
      leadCharacterId: project?.characters.find((character) => character.isLead)?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
