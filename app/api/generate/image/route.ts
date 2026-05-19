import { NextRequest } from "next/server";
import { generateShotImagesWithTask } from "@/lib/workflows/image-generation";
import { prisma } from "@/lib/prisma";
import { validateImageGenerationBody, jsonError } from "@/lib/route-validation";

export async function POST(req: NextRequest) {
  try {
    const parsed = validateImageGenerationBody(await req.json().catch(() => null));
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

    const { taskId } = await generateShotImagesWithTask({
      projectId,
      episodeId,
      sceneId,
      shotId,
      prompt: body.prompt ?? "",
      refImageUrls: body.refImageUrls,
      provider: body.provider,
      candidateCount: body.candidateCount ?? 2,
    });

    return Response.json({ taskId, status: "queued" });
  } catch (err) {
    console.error("[api/generate/image]", err);
    return jsonError(500, "image_generation_failed", "Image generation failed");
  }
}
