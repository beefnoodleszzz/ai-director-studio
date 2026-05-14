import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ImageGenerator } from "@/lib/models/image";
import { enqueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
  try {
    const { episodeId, sceneIds, provider } = await req.json() as {
      episodeId?: string;
      sceneIds?: string[];
      provider?: string;
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

    const imageProvider = ImageGenerator.getProvider(provider);

    const results = await Promise.all(
      targetSceneIds.map((sceneId) =>
        enqueue(async () => {
          const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
          if (!scene) return { sceneId, error: "Scene not found" };

          try {
            await prisma.scene.update({ where: { id: sceneId }, data: { status: "generating" } });
            const result = await imageProvider.generate(scene.visualPrompt);
            await prisma.scene.update({
              where: { id: sceneId },
              data: { localImage: result.localPath, status: "image_done" },
            });
            return { sceneId, localPath: result.localPath, imageUrl: result.imageUrl };
          } catch (err) {
            await prisma.scene.update({ where: { id: sceneId }, data: { status: "error" } });
            return { sceneId, error: String(err) };
          }
        })
      )
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[generate/image]", err);
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }
}
