import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateEpisodeStage } from "@/lib/production-state";
import { validateOutlinePatchBody } from "@/lib/route-validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const parsed = validateOutlinePatchBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

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
