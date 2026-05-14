import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { breakdownScript } from "@/lib/models/text";

export async function POST(req: NextRequest) {
  try {
    const { episodeId, script } = await req.json() as { episodeId: string; script: string };

    if (!episodeId || !script) {
      return NextResponse.json({ error: "episodeId and script are required" }, { status: 400 });
    }

    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: { project: { include: { characters: true } } },
    });

    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    const characters = episode.project.characters.map((c) => ({
      name: c.name,
      prompt: c.prompt,
      refImageUrl: c.refImageUrl,
    }));

    const result = await breakdownScript(script, characters, episode.project.globalLore);

    await prisma.episode.update({
      where: { id: episodeId },
      data: { summary: result.episodeSummary },
    });

    await prisma.scene.deleteMany({ where: { episodeId } });

    const scenes = await Promise.all(
      result.scenes.map((s) =>
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

    return NextResponse.json({ scenes, summary: result.episodeSummary });
  } catch (err) {
    console.error("[generate/script]", err);
    return NextResponse.json({ error: "Failed to breakdown script" }, { status: 500 });
  }
}
