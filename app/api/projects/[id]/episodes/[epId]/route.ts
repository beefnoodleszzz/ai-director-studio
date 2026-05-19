import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateEpisodeStage } from "@/lib/production-state";
import { validateEpisodeUpdateBody } from "@/lib/route-validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string }> }
) {
  try {
    const { epId } = await params;
    const episode = await prisma.episode.findUnique({
      where: { id: epId },
      include: {
        scenes: {
          orderBy: { sceneOrder: "asc" },
          include: {
            shots: {
              orderBy: { shotOrder: "asc" },
              include: {
                takes: {
                  orderBy: { createdAt: "desc" },
                  include: {
                    reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(episode);
  } catch (err) {
    console.error("[GET /api/projects/:id/episodes/:epId]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string }> }
) {
  try {
    const { id: projectId, epId } = await params;
    const parsed = validateEpisodeUpdateBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
    const episodeRecord = await prisma.episode.findFirst({
      where: { id: epId, projectId },
      select: { id: true },
    });
    if (!episodeRecord) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const episode = await prisma.episode.update({ where: { id: epId }, data: body });
    await recalculateEpisodeStage(epId);
    return NextResponse.json(episode);
  } catch (err) {
    console.error("[PATCH /api/projects/:id/episodes/:epId]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
