import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SceneCard } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { episodeId, scenes } = (await req.json()) as {
      episodeId: string;
      scenes: SceneCard[];
    };

    if (!episodeId || !scenes?.length) {
      return NextResponse.json(
        { error: "episodeId and scenes are required" },
        { status: 400 }
      );
    }

    const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    // 清除旧分镜，写入新分镜
    await prisma.scene.deleteMany({ where: { episodeId } });

    const created = await Promise.all(
      scenes.map((s) =>
        prisma.scene.create({
          data: {
            episodeId,
            sceneOrder: s.sceneOrder,
            visualPrompt: s.visualPrompt,
            dialogue: s.dialogue,
            audioPrompt: s.audioPrompt,
            status: "pending",
          },
        })
      )
    );

    return NextResponse.json({ status: "SUCCESS", scenes: created });
  } catch (err) {
    console.error("[scenes/batch-create]", err);
    return NextResponse.json({ error: "Batch create failed" }, { status: 500 });
  }
}
