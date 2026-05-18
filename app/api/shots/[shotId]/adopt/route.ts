/**
 * 手动指定采用的 Take
 * POST /api/shots/:shotId/adopt { takeId, takeType? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
  ) {
  try {
    const { shotId } = await params;
    const { takeId, takeType } = (await req.json()) as { takeId: string; takeType?: string };

    if (!takeId) {
      return NextResponse.json({ error: "takeId is required" }, { status: 400 });
    }

    const take = await prisma.take.findUnique({ where: { id: takeId } });
    if (!take || take.shotId !== shotId) {
      return NextResponse.json({ error: "Take not found" }, { status: 404 });
    }

    const resolvedTakeType = takeType ?? take.takeType;

    await prisma.take.updateMany({
      where: { shotId, takeType: resolvedTakeType, isAdopted: true },
      data: { isAdopted: false },
    });

    await prisma.take.update({
      where: { id: takeId },
      data: { isAdopted: true, isDiscarded: false },
    });

    const shotPatch =
      resolvedTakeType === "image"
        ? { adoptedImageTakeId: takeId, pipelineStage: "image_ready" }
        : resolvedTakeType === "video"
          ? { adoptedVideoTakeId: takeId, hasMotionVideo: true, pipelineStage: "video_ready" }
          : resolvedTakeType === "audio"
            ? { adoptedAudioTakeId: takeId, pipelineStage: "ready_for_export" }
            : {};

    await prisma.shot.update({
      where: { id: shotId },
      data: shotPatch,
    });

    return NextResponse.json({
      success: true,
      takeId,
      takeType: resolvedTakeType,
      adoptedImageTakeId: resolvedTakeType === "image" ? takeId : undefined,
      adoptedVideoTakeId: resolvedTakeType === "video" ? takeId : undefined,
      adoptedAudioTakeId: resolvedTakeType === "audio" ? takeId : undefined,
    });
  } catch (err) {
    console.error("[POST /api/shots/:shotId/adopt]", err);
    return NextResponse.json({ error: "Failed to adopt take" }, { status: 500 });
  }
}
