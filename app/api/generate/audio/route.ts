import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AudioGenerator } from "@/lib/models/audio";
import { enqueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
  try {
    const { episodeId, sceneIds, audioProvider } = await req.json() as {
      episodeId?: string;
      sceneIds?: string[];
      audioProvider?: string;
    };

    let targetSceneIds: string[] = [];

    if (sceneIds && sceneIds.length > 0) {
      targetSceneIds = sceneIds;
    } else if (episodeId) {
      const scenes = await prisma.scene.findMany({
        where: { episodeId },
        orderBy: { sceneOrder: "asc" },
      });
      targetSceneIds = scenes.map((s) => s.id);
    } else {
      return NextResponse.json({ error: "episodeId or sceneIds required" }, { status: 400 });
    }

    const provider = AudioGenerator.getProvider(audioProvider ?? "minimax");

    const results = await Promise.all(
      targetSceneIds.map((sceneId) =>
        enqueue(async () => {
          const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
          if (!scene) return { sceneId, error: "Scene not found" };

          if (!scene.dialogue.trim()) {
            return { sceneId, skipped: true, reason: "No dialogue" };
          }

          try {
            const result = await provider.synthesize(scene.dialogue, scene.audioPrompt);
            await prisma.scene.update({
              where: { id: sceneId },
              data: { localAudio: result.localPath },
            });
            return { sceneId, localPath: result.localPath };
          } catch (err) {
            return { sceneId, error: String(err) };
          }
        })
      )
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[generate/audio]", err);
    return NextResponse.json({ error: "Audio generation failed" }, { status: 500 });
  }
}
