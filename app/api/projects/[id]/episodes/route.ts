import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { episodeNum, summary } = await req.json() as {
      episodeNum?: number;
      summary?: string;
    };

    const lastEpisode = await prisma.episode.findFirst({
      where: { projectId },
      orderBy: { episodeNum: "desc" },
    });

    const nextNum = episodeNum ?? (lastEpisode?.episodeNum ?? 0) + 1;

    const episode = await prisma.episode.create({
      data: {
        projectId,
        episodeNum: nextNum,
        summary: summary ?? "",
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
