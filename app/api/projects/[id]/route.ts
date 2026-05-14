import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        styleBible: true,
        characters: {
          include: { voiceProfile: true, assets: true },
          orderBy: { createdAt: "asc" },
        },
        episodes: {
          orderBy: { episodeNum: "asc" },
          include: {
            scenes: {
              orderBy: { sceneOrder: "asc" },
              include: {
                shots: {
                  orderBy: { shotOrder: "asc" },
                  include: { takes: { orderBy: { createdAt: "desc" } } },
                },
              },
            },
          },
        },
      },
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
    const body = (await req.json()) as Partial<{
      title: string;
      type: string;
      aspect: string;
      platform: string;
      worldSetting: string;
      era: string;
      forbidRules: string;
    }>;

    const project = await prisma.project.update({ where: { id }, data: body });
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
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/projects/:id]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
