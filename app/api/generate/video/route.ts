import { NextRequest, NextResponse } from "next/server";
import { generateShotVideoWithTask } from "@/lib/workflows/video-generation";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId: string;
      episodeId: string;
      sceneId: string;
      shotId: string;
      adoptedTakeId: string;
      visualPrompt?: string;
      provider?: string;
    };

    const { projectId, episodeId, sceneId, shotId, adoptedTakeId } = body;
    if (!projectId || !episodeId || !sceneId || !shotId || !adoptedTakeId) {
      return NextResponse.json(
        { error: "projectId, episodeId, sceneId, shotId, adoptedTakeId are required" },
        { status: 400 }
      );
    }

    const { taskId, result } = await generateShotVideoWithTask({
      projectId,
      episodeId,
      sceneId,
      shotId,
      adoptedTakeId,
      visualPrompt: body.visualPrompt ?? "",
      provider: body.provider,
    });

    return NextResponse.json({ taskId, ...result });
  } catch (err) {
    console.error("[api/generate/video]", err);
    return NextResponse.json({ error: "Video generation failed" }, { status: 500 });
  }
}
