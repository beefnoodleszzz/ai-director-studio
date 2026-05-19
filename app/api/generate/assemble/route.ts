import { NextRequest, NextResponse } from "next/server";
import { assembleWithTask, ExportPreflightError, previewShortDramaExport } from "@/lib/workflows/assembly";
import { validateAssembleBody } from "@/lib/route-validation";

export async function POST(req: NextRequest) {
  try {
    const parsed = validateAssembleBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
    const { projectId, episodeId } = body;

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
    if (err instanceof ExportPreflightError) {
      return NextResponse.json(
        {
          error: err.message,
          preflight: err.preflight,
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: "Assembly failed" }, { status: 500 });
  }
}
