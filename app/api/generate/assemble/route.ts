import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assembleEpisode } from "@/lib/ffmpeg";

export async function POST(req: NextRequest) {
  let episodeId: string | undefined;
  try {
    const body = await req.json() as { episodeId: string };
    episodeId = body.episodeId;

    if (!episodeId) {
      return NextResponse.json({ error: "episodeId is required" }, { status: 400 });
    }

    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: { scenes: { orderBy: { sceneOrder: "asc" } } },
    });

    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    const validScenes = episode.scenes.filter(
      (s) => s.localVideo || s.localImage
    );

    if (validScenes.length === 0) {
      return NextResponse.json(
        { error: "No scenes with media to assemble" },
        { status: 400 }
      );
    }

    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "generating" },
    });

    const outputFilename = `episode_${episodeId}_${Date.now()}.mp4`;

    const outputPath = await assembleEpisode({
      scenes: validScenes.map((s) => ({
        sceneId: s.id,
        localVideo: s.localVideo,
        localImage: s.localImage,
        localAudio: s.localAudio,
        duration: 5,
      })),
      outputFilename,
    });

    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "completed" },
    });

    return NextResponse.json({ outputPath, episodeId });
  } catch (err) {
    console.error("[generate/assemble]", err);
    if (episodeId) {
      await prisma.episode.update({
        where: { id: episodeId },
        data: { status: "draft" },
      }).catch(() => {});
    }
    return NextResponse.json({ error: "Assembly failed" }, { status: 500 });
  }
}
