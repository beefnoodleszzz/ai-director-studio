import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VideoGenerator } from "@/lib/models/video";
import { enqueue } from "@/lib/queue";
import { getLocalPath } from "@/lib/asset";

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
        where: { episodeId, status: "image_done" },
        orderBy: { sceneOrder: "asc" },
      });
      targetSceneIds = scenes.map((s) => s.id);
    } else {
      return NextResponse.json({ error: "episodeId or sceneIds required" }, { status: 400 });
    }

    const videoProvider = VideoGenerator.getProvider(provider);

    const results = await Promise.all(
      targetSceneIds.map((sceneId) =>
        enqueue(async () => {
          const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
          if (!scene || !scene.localImage) {
            return { sceneId, error: "Scene has no local image" };
          }

          try {
            await prisma.scene.update({ where: { id: sceneId }, data: { status: "generating" } });

            const imageAbsPath = getLocalPath(scene.localImage);
            const result = await videoProvider.generateI2V(imageAbsPath, scene.visualPrompt);

            if (result.status === "completed" && result.localPath) {
              await prisma.scene.update({
                where: { id: sceneId },
                data: { localVideo: result.localPath, status: "video_done" },
              });
              return { sceneId, localPath: result.localPath };
            } else {
              await prisma.scene.update({ where: { id: sceneId }, data: { status: "error" } });
              return { sceneId, error: "Video generation failed" };
            }
          } catch (err) {
            await prisma.scene.update({ where: { id: sceneId }, data: { status: "error" } });
            return { sceneId, error: String(err) };
          }
        })
      )
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[generate/video]", err);
    return NextResponse.json({ error: "Video generation failed" }, { status: 500 });
  }
}
