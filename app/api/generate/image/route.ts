import { NextRequest, NextResponse } from "next/server";
import { generateShotImagesWithTask } from "@/lib/workflows/image-generation";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId: string;
      episodeId: string;
      sceneId: string;
      shotId: string;
      prompt?: string;
      refImageUrls?: string[];
      provider?: string;
      candidateCount?: number;
    };

    const { projectId, episodeId, sceneId, shotId } = body;
    if (!projectId || !episodeId || !sceneId || !shotId) {
      return NextResponse.json(
        { error: "projectId, episodeId, sceneId, shotId are required" },
        { status: 400 }
      );
    }

    const { taskId, result } = await generateShotImagesWithTask({
      projectId,
      episodeId,
      sceneId,
      shotId,
      prompt: body.prompt ?? "",
      refImageUrls: body.refImageUrls,
      provider: body.provider,
      candidateCount: body.candidateCount ?? 2,
    });

    return NextResponse.json({ taskId, ...result });
  } catch (err) {
    console.error("[api/generate/image]", err);
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }
}
