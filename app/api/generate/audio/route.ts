import { NextRequest, NextResponse } from "next/server";
import { generateShotAudioWithTask } from "@/lib/workflows/audio-generation";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId: string;
      episodeId: string;
      sceneId: string;
      shotId: string;
      dialogue: string;
      audioPrompt?: string;
      voiceId?: string;
      provider?: string;
    };

    const { projectId, episodeId, sceneId, shotId, dialogue } = body;
    if (!projectId || !episodeId || !sceneId || !shotId || !dialogue) {
      return NextResponse.json(
        { error: "projectId, episodeId, sceneId, shotId, dialogue are required" },
        { status: 400 }
      );
    }

    const { taskId, result } = await generateShotAudioWithTask({
      projectId,
      episodeId,
      sceneId,
      shotId,
      dialogue,
      audioPrompt: body.audioPrompt ?? "",
      voiceId: body.voiceId,
      provider: body.provider,
    });

    return NextResponse.json({ taskId, ...result });
  } catch (err) {
    console.error("[api/generate/audio]", err);
    return NextResponse.json({ error: "Audio generation failed" }, { status: 500 });
  }
}
