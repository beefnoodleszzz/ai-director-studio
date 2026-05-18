import { NextRequest, NextResponse } from "next/server";
import { assembleWithTask, previewShortDramaExport } from "@/lib/workflows/assembly";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId: string;
      episodeId: string;
      aspect?: "16:9" | "9:16";
      bgmPath?: string;
      previewOnly?: boolean;
      minResolution?: {
        width: number;
        height: number;
      };
    };

    const { projectId, episodeId } = body;
    if (!projectId || !episodeId) {
      return NextResponse.json({ error: "projectId and episodeId are required" }, { status: 400 });
    }

    if (body.previewOnly) {
      const preview = await previewShortDramaExport({
        projectId,
        episodeId,
        aspect: body.aspect,
        bgmPath: body.bgmPath,
        minResolution: body.minResolution,
      });
      return NextResponse.json(preview);
    }

    const { taskId, result } = await assembleWithTask({
      projectId,
      episodeId,
      aspect: body.aspect,
      bgmPath: body.bgmPath,
      minResolution: body.minResolution,
    });

    return NextResponse.json({ taskId, ...result });
  } catch (err) {
    console.error("[api/generate/assemble]", err);
    return NextResponse.json({ error: "Assembly failed" }, { status: 500 });
  }
}
