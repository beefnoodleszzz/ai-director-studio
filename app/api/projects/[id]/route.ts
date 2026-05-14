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
        characters: true,
        episodes: {
          orderBy: { episodeNum: "asc" },
          include: { scenes: { orderBy: { sceneOrder: "asc" } } },
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
    const body = await req.json() as { title?: string; globalLore?: string };
    const project = await prisma.project.update({
      where: { id },
      data: body,
      include: { characters: true, episodes: true },
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
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/projects/:id]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
