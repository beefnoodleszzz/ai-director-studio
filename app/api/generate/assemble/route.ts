import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assembleEpisode } from "@/lib/ffmpeg";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  let episodeId: string | undefined;
  try {
    const body = (await req.json()) as {
      episodeId: string;
      bgmPath?: string;
      aspect?: "16:9" | "9:16";
    };
    episodeId = body.episodeId;

    if (!episodeId) {
      return NextResponse.json({ error: "episodeId is required" }, { status: 400 });
    }

    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        scenes: { orderBy: { sceneOrder: "asc" } },
        project: true,
      },
    });

    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    const validScenes = episode.scenes.filter((s) => s.localVideo || s.localImage);

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

    const outputDir = path.join(process.cwd(), "public", "workspace", "output");
    fs.mkdirSync(outputDir, { recursive: true });

    const outputFilename = `episode_${episodeId}_${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);
    const outputPublicPath = `/workspace/output/${outputFilename}`;

    const aspect = (body.aspect ?? episode.project.aspect ?? "16:9") as "16:9" | "9:16";

    await assembleEpisode(
      validScenes.map((s) => ({
        localVideo: s.localVideo ? path.join(process.cwd(), "public", s.localVideo) : null,
        localImage: s.localImage ? path.join(process.cwd(), "public", s.localImage) : null,
        localAudio: s.localAudio ? path.join(process.cwd(), "public", s.localAudio) : null,
        localSfx: s.localSfx ? path.join(process.cwd(), "public", s.localSfx) : null,
        localBgm: s.localBgm ? path.join(process.cwd(), "public", s.localBgm) : null,
      })),
      {
        outputPath,
        bgmPath: body.bgmPath
          ? path.join(process.cwd(), "public", body.bgmPath)
          : undefined,
        aspect,
      }
    );

    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "completed", outputPath: outputPublicPath },
    });

    return NextResponse.json({ outputPath: outputPublicPath, episodeId });
  } catch (err) {
    console.error("[generate/assemble]", err);
    if (episodeId) {
      await prisma.episode
        .update({ where: { id: episodeId }, data: { status: "draft" } })
        .catch(() => {});
    }
    return NextResponse.json({ error: "Assembly failed" }, { status: 500 });
  }
}
