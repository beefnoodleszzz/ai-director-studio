import { NextRequest, NextResponse } from "next/server";
import { lockProjectCast } from "@/lib/workflows/story-workflow";
import { prisma } from "@/lib/prisma";
import { validateCastLockBody } from "@/lib/route-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const parsed = validateCastLockBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const { leadCharacterId } = parsed.value;
    await lockProjectCast(projectId, leadCharacterId);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
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
      characters: project?.characters ?? [],
      leadCharacterId: project?.characters.find((character) => character.isLead)?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
