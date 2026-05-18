/**
 * 手动指定采用的 Take
 * POST /api/shots/:shotId/adopt { takeId, takeType? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeShotStateById, recalculateEpisodeStage } from "@/lib/production-state";

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
        ? { adoptedImageTakeId: takeId }
        : resolvedTakeType === "video"
          ? { adoptedVideoTakeId: takeId }
          : resolvedTakeType === "audio"
            ? { adoptedAudioTakeId: takeId }
            : {};

    const shot = await prisma.shot.update({
      where: { id: shotId },
      data: shotPatch,
    });
    const normalizedShot = await normalizeShotStateById(shotId);
    await recalculateEpisodeStage(shot.sceneId);

    return NextResponse.json({
      success: true,
      takeId,
      takeType: resolvedTakeType,
      shotState: normalizedShot,
    });
  } catch (err) {
    console.error("[POST /api/shots/:shotId/adopt]", err);
    return NextResponse.json({ error: "Failed to adopt take" }, { status: 500 });
  }
}
