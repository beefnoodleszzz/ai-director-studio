/**
 * 批量重做：根据 QA 失败的 take 批量触发重新生成
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShotImagesWithTask } from "@/lib/workflows/image-generation";
import { generateShotVideoWithTask } from "@/lib/workflows/video-generation";
import { generateShotAudioWithTask } from "@/lib/workflows/audio-generation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await req.json() as {
      takeIds: string[];
      provider?: string;
    };

    const { takeIds, provider } = body;
    if (!takeIds?.length) {
      return NextResponse.json({ error: "takeIds required" }, { status: 400 });
    }

    const takes = await prisma.take.findMany({
      where: { id: { in: takeIds } },
      include: {
        shot: {
          include: {
            scene: {
              include: {
                episode: { select: { id: true, projectId: true } },
              },
            },
          },
        },
      },
    });

    const taskIds: string[] = [];
    for (const take of takes) {
      const shot = take.shot;
      const epId = shot.scene.episode.id;
      const scId = shot.scene.id;
      const shotId = shot.id;

      try {
        if (take.takeType === "image") {
          const { taskId } = await generateShotImagesWithTask({
            projectId,
            episodeId: epId,
            sceneId: scId,
            shotId,
            prompt: shot.visualPrompt,
            provider: provider ?? take.provider ?? "seedream",
            candidateCount: 1,
          });
          taskIds.push(taskId);
        } else if (take.takeType === "video") {
          // 视频重做需要已有采用的首帧 take
          const adoptedImageTake = await prisma.take.findFirst({
            where: { shotId, takeType: "image", isAdopted: true },
          });
          if (!adoptedImageTake) continue;
          const { taskId } = await generateShotVideoWithTask({
            projectId,
            episodeId: epId,
            sceneId: scId,
            shotId,
            adoptedImageTakeId: adoptedImageTake.id,
            visualPrompt: shot.visualPrompt ?? "",
            provider: provider ?? take.provider ?? "seedance",
          });
          taskIds.push(taskId);
        } else if (take.takeType === "audio") {
          const { taskId } = await generateShotAudioWithTask({
            projectId,
            episodeId: epId,
            sceneId: scId,
            shotId,
            dialogue: shot.dialogue,
            audioPrompt: shot.audioPrompt,
            provider: provider ?? take.provider ?? "doubao-tts",
          });
          taskIds.push(taskId);
        }
      } catch {
        // 单个失败不阻断
      }
    }

    return NextResponse.json({ queued: taskIds.length, taskIds });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
