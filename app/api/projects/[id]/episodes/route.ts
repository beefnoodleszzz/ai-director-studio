import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const episodes = await prisma.episode.findMany({
      where: { projectId },
      orderBy: { episodeNum: "asc" },
      include: {
        scenes: {
          orderBy: { sceneOrder: "asc" },
          include: { shots: { orderBy: { shotOrder: "asc" }, select: { id: true, status: true } } },
        },
      },
    });
    return NextResponse.json(episodes);
  } catch (err) {
    console.error("[GET /api/projects/:id/episodes]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = (await req.json()) as { episodeNum?: number; title?: string; summary?: string };

    const lastEpisode = await prisma.episode.findFirst({
      where: { projectId },
      orderBy: { episodeNum: "desc" },
    });

    const nextNum = body.episodeNum ?? (lastEpisode?.episodeNum ?? 0) + 1;

    const episode = await prisma.episode.create({
      data: {
        projectId,
        episodeNum: nextNum,
        title: body.title ?? `第 ${nextNum} 集`,
        summary: body.summary ?? "",
        status: "draft",
      },
      include: { scenes: true },
    });

    return NextResponse.json(episode, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects/:id/episodes]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
