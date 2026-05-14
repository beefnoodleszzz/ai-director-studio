import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VideoGenerator } from "@/lib/models/video";
import { enqueue } from "@/lib/queue";
import { getLocalPath } from "@/lib/asset";
import { qaVideo } from "@/lib/qa";
import path from "path";

const QA_MAX_RETRIES = 3;

export async function POST(req: NextRequest) {
  try {
    const { episodeId, sceneIds, provider } = (await req.json()) as {
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

          let attempt = 0;
          let localPath: string | null = null;

          while (attempt < QA_MAX_RETRIES) {
            attempt++;
            try {
              await prisma.scene.update({
                where: { id: sceneId },
                data: { status: "generating", qaStatus: "pending", qaRetries: attempt - 1 },
              });

              const imageAbsPath = getLocalPath(scene.localImage);
              const result = await videoProvider.generateI2V(imageAbsPath, scene.visualPrompt);

              if (result.status !== "completed" || !result.localPath) {
                continue; // retry
              }

              localPath = result.localPath;

              // 视觉质检
              const absVideoPath = path.join(process.cwd(), "public", localPath);
              const qaResult = await qaVideo(absVideoPath);

              if (qaResult.pass) {
                await prisma.scene.update({
                  where: { id: sceneId },
                  data: {
                    localVideo: localPath,
                    status: "video_done",
                    qaStatus: "pass",
                    qaRetries: attempt,
                  },
                });
                return { sceneId, localPath, qa: "pass", attempts: attempt };
              } else {
                console.warn(`[QA] Scene ${sceneId} 质检失败 (第 ${attempt} 次)，准备重试`);
                await prisma.scene.update({
                  where: { id: sceneId },
                  data: { qaStatus: "qa_failed", qaRetries: attempt },
                });
                // 继续 while 循环重试
              }
            } catch (err) {
              console.error(`[video] Scene ${sceneId} 第 ${attempt} 次生成错误:`, err);
            }
          }

          // 超过最大重试次数，取最后一次结果（质检宽容降级）
          if (localPath) {
            await prisma.scene.update({
              where: { id: sceneId },
              data: {
                localVideo: localPath,
                status: "video_done",
                qaStatus: "qa_failed",
                qaRetries: attempt,
              },
            });
            return { sceneId, localPath, qa: "degraded", attempts: attempt };
          }

          await prisma.scene.update({ where: { id: sceneId }, data: { status: "error" } });
          return { sceneId, error: "Video generation failed after retries" };
        })
      )
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[generate/video]", err);
    return NextResponse.json({ error: "Video generation failed" }, { status: 500 });
  }
}
