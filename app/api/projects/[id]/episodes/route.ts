import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateEpisodeStage } from "@/lib/production-state";
import { evaluateShotRisk } from "@/lib/shot-risk";
import { validateEpisodeCreateBody } from "@/lib/route-validation";

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
          include: {
            shots: {
              orderBy: { shotOrder: "asc" },
              select: {
                id: true,
                pipelineStage: true,
                exportReadiness: true,
                dramaticTag: true,
                adoptedImageTakeId: true,
                adoptedVideoTakeId: true,
              },
            },
          },
        },
      },
    });
    return NextResponse.json(
      episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => ({
          ...scene,
          shots: scene.shots.map((shot) => ({
            ...shot,
            risk: evaluateShotRisk(shot),
          })),
        })),
      }))
    );
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
    const parsed = validateEpisodeCreateBody(await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

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
      },
      include: { scenes: true },
    });
    const normalized = await recalculateEpisodeStage(episode.id);

    return NextResponse.json(normalized, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects/:id/episodes]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
