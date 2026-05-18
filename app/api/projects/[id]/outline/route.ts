import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateEpisodeStage } from "@/lib/production-state";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = (await req.json()) as { storyOutline: unknown };

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        storyOutline: JSON.stringify(body.storyOutline ?? {}),
      },
    });
    const episodes = await prisma.episode.findMany({
      where: { projectId },
      select: { id: true },
    });
    await Promise.all(episodes.map((episode) => recalculateEpisodeStage(episode.id)));

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
