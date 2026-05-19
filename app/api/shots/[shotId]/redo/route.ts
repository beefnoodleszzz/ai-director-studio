import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShotVideoWithTask } from "@/lib/workflows/video-generation";
import { validateShotRedoBody } from "@/lib/route-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const parsed = validateShotRedoBody(await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

    const shot = await prisma.shot.findUnique({
      where: { id: shotId },
      include: {
        scene: {
          include: {
            episode: {
              select: {
                id: true,
                projectId: true,
              },
            },
          },
        },
      },
    });

    if (!shot) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    const adoptedImageTake = await prisma.take.findFirst({
      where: {
        shotId,
        takeType: "image",
        isAdopted: true,
      },
    });

    if (!adoptedImageTake) {
      return NextResponse.json({ error: "No adopted image take found" }, { status: 422 });
    }

    await prisma.shot.update({
      where: { id: shotId },
      data: {
        blockReason: "",
        blockMeta: "",
        pipelineStage: "image_ready",
      },
    });

    const { taskId } = await generateShotVideoWithTask({
      projectId: shot.scene.episode.projectId,
      episodeId: shot.scene.episode.id,
      sceneId: shot.sceneId,
      shotId,
      adoptedImageTakeId: adoptedImageTake.id,
      visualPrompt: `${shot.visualPrompt}${body.strategyHint ? `, repair guidance: ${body.strategyHint}` : ""}`,
    });

    return NextResponse.json({
      ok: true,
      taskId,
      strategyHint: body.strategyHint ?? null,
      reasonTags: body.reasonTags ?? [],
      status: "queued",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
