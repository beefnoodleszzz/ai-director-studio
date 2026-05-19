import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removeProjectAssetDirs } from "@/lib/asset";
import { validateProjectUpdateBody } from "@/lib/route-validation";

const projectDetailSelect = {
  id: true,
  title: true,
  type: true,
  aspect: true,
  worldSetting: true,
  era: true,
  storyOutline: true,
  createdAt: true,
  styleBible: {
    select: {
      id: true,
      genreTag: true,
      visualStyle: true,
    },
  },
  characters: {
    orderBy: { createdAt: "asc" as const },
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
  episodes: {
    orderBy: { episodeNum: "asc" as const },
    select: {
      id: true,
      episodeNum: true,
      title: true,
      summary: true,
      hook: true,
      cliffhanger: true,
      scriptDraft: true,
      scriptMeta: true,
      productionStage: true,
      scenes: {
        orderBy: { sceneOrder: "asc" as const },
        select: {
          id: true,
          shots: {
            orderBy: { shotOrder: "asc" as const },
            select: {
              id: true,
              pipelineStage: true,
              exportReadiness: true,
            },
          },
        },
      },
    },
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      select: projectDetailSelect,
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    console.error("[GET /api/projects/:id]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = validateProjectUpdateBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
    const data = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.aspect !== undefined ? { aspect: body.aspect } : {}),
      ...(body.worldSetting !== undefined ? { worldSetting: body.worldSetting.trim() } : {}),
      ...(body.era !== undefined ? { era: body.era.trim() } : {}),
    };

    const project = await prisma.project.update({
      where: { id },
      data,
      select: projectDetailSelect,
    });
    return NextResponse.json(project);
  } catch (err) {
    console.error("[PATCH /api/projects/:id]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.project.delete({ where: { id } });
    removeProjectAssetDirs(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/projects/:id]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
