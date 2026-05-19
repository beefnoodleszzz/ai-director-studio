import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShotAudioWithTask } from "@/lib/workflows/audio-generation";
import { jsonError, validateAudioGenerationBody } from "@/lib/route-validation";

export async function POST(req: NextRequest) {
  try {
    const parsed = validateAudioGenerationBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.value;
    const shot = await prisma.shot.findFirst({
      where: {
        id: body.shotId,
        sceneId: body.sceneId,
        scene: {
          episodeId: body.episodeId,
          episode: { projectId: body.projectId },
        },
      },
      select: { id: true },
    });
    if (!shot) {
      return jsonError(404, "shot_not_found", "Shot was not found for the provided project/episode/scene context");
    }

    const { taskId } = await generateShotAudioWithTask({
      projectId: body.projectId,
      episodeId: body.episodeId,
      sceneId: body.sceneId,
      shotId: body.shotId,
      dialogue: body.dialogue,
      audioPrompt: body.audioPrompt ?? "",
      voiceId: body.voiceId,
      provider: body.provider,
    });

    return Response.json({ taskId, status: "queued" });
  } catch (err) {
    console.error("[api/generate/audio]", err);
    return jsonError(500, "audio_generation_failed", "Audio generation failed");
  }
}
