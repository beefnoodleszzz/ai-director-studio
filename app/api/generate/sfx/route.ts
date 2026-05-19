import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShotSFX } from "@/lib/workflows/audio-generation";
import { jsonError, validateSfxGenerationBody } from "@/lib/route-validation";

export async function POST(req: NextRequest) {
  try {
    const parsed = validateSfxGenerationBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const { projectId, episodeId, sceneId, shotId, sfxPrompt } = parsed.value;

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

    const result = await generateShotSFX(projectId, episodeId, sceneId, shotId, sfxPrompt);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/generate/sfx]", err);
    return jsonError(500, "sfx_generation_failed", "SFX generation failed");
  }
}
