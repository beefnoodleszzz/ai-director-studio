import { NextRequest, NextResponse } from "next/server";
import { generateShotSFX } from "@/lib/workflows/audio-generation";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId: string;
      episodeId: string;
      sceneId: string;
      shotId: string;
      sfxPrompt: string;
    };

    const { projectId, episodeId, sceneId, shotId, sfxPrompt } = body;
    if (!projectId || !episodeId || !sceneId || !shotId || !sfxPrompt) {
      return NextResponse.json(
        { error: "projectId, episodeId, sceneId, shotId, sfxPrompt are required" },
        { status: 400 }
      );
    }

    const result = await generateShotSFX(projectId, episodeId, sceneId, shotId, sfxPrompt);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/generate/sfx]", err);
    return NextResponse.json({ error: "SFX generation failed" }, { status: 500 });
  }
}
