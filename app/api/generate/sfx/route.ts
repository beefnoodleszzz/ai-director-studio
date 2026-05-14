import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SfxGenerator } from "@/lib/models/sfx";
import { enqueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
  try {
    const { episodeId, sceneIds } = (await req.json()) as {
      episodeId?: string;
      sceneIds?: string[];
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

    const sfxProvider = SfxGenerator.getProvider();

    const results = await Promise.all(
      targetSceneIds.map((sceneId) =>
        enqueue(async () => {
          const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
          if (!scene || !scene.audioPrompt) {
            return { sceneId, skipped: true };
          }

          try {
            // 从 audioPrompt 提取方括号内的音效描述，如 [雨声] [打斗声]
            const sfxTags = (scene.audioPrompt.match(/\[([^\]]+)\]/g) ?? [])
              .map((t) => t.slice(1, -1))
              .join(", ");

            const prompt = sfxTags || scene.audioPrompt;
            const result = await sfxProvider.generate(prompt);

            await prisma.scene.update({
              where: { id: sceneId },
              data: { localSfx: result.localPath },
            });

            return { sceneId, localPath: result.localPath };
          } catch (err) {
            console.error(`[sfx] Scene ${sceneId} 生成失败:`, err);
            return { sceneId, error: String(err) };
          }
        })
      )
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[generate/sfx]", err);
    return NextResponse.json({ error: "SFX generation failed" }, { status: 500 });
  }
}
