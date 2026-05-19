import { NextRequest } from "next/server";
import { generateShotVideoWithTask } from "@/lib/workflows/video-generation";
import { prisma } from "@/lib/prisma";
import { jsonError, validateVideoGenerationBody } from "@/lib/route-validation";

export async function POST(req: NextRequest) {
  try {
    const parsed = validateVideoGenerationBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.value;
    const { projectId, episodeId, sceneId, shotId } = body;
    const shot = await prisma.shot.findFirst({
      where: {
        id: shotId,
        sceneId,
        scene: {
          episodeId,
          episode: { projectId },
        },
      },
      select: { id: true },
    });
    if (!shot) {
      return jsonError(404, "shot_not_found", "Shot was not found for the provided project/episode/scene context");
    }

    const adoptedImageTake = await prisma.take.findFirst({
      where: {
        id: body.adoptedImageTakeId,
        shotId,
        takeType: "image",
      },
      select: { id: true },
    });
    if (!adoptedImageTake) {
      return jsonError(404, "image_take_not_found", "adoptedImageTakeId must reference an image take on the same shot");
    }

    const { taskId } = await generateShotVideoWithTask({
      projectId,
      episodeId,
      sceneId,
      shotId,
      adoptedImageTakeId: body.adoptedImageTakeId,
      visualPrompt: body.visualPrompt ?? "",
      provider: body.provider,
      stopOnQaFail: body.stopOnQaFail ?? true,
    });

    return Response.json({ taskId, status: "queued" });
  } catch (err) {
    console.error("[api/generate/video]", err);
    return jsonError(500, "video_generation_failed", "Video generation failed");
  }
}
