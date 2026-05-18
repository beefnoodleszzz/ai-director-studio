import { NextRequest, NextResponse } from "next/server";
import { generateShotVideoWithTask } from "@/lib/workflows/video-generation";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId: string;
      episodeId: string;
      sceneId: string;
      shotId: string;
      adoptedImageTakeId?: string;
      visualPrompt?: string;
      provider?: string;
      stopOnQaFail?: boolean;
    };

    const { projectId, episodeId, sceneId, shotId } = body;
    if (!projectId || !episodeId || !sceneId || !shotId || !body.adoptedImageTakeId) {
      return NextResponse.json(
        { error: "projectId, episodeId, sceneId, shotId, adoptedImageTakeId are required" },
        { status: 400 }
      );
    }

    const { taskId, result } = await generateShotVideoWithTask({
      projectId,
      episodeId,
      sceneId,
      shotId,
      adoptedImageTakeId: body.adoptedImageTakeId,
      visualPrompt: body.visualPrompt ?? "",
      provider: body.provider,
      stopOnQaFail: body.stopOnQaFail ?? true,
    });

    return NextResponse.json({ taskId, ...result });
  } catch (err) {
    console.error("[api/generate/video]", err);
    return NextResponse.json({ error: "Video generation failed" }, { status: 500 });
  }
}
