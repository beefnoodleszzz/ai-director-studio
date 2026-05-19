/**
 * 手动指定采用的 Take
 * POST /api/shots/:shotId/adopt { takeId, takeType? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeShotStateById, recalculateEpisodeStage } from "@/lib/production-state";
import { jsonError, validateShotAdoptBody } from "@/lib/route-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
  ) {
  try {
    const { shotId } = await params;
    const parsed = validateShotAdoptBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const { takeId, takeType } = parsed.value;

    const take = await prisma.take.findUnique({ where: { id: takeId } });
    if (!take || take.shotId !== shotId) {
      return NextResponse.json({ error: "Take not found" }, { status: 404 });
    }

    if (takeType && takeType !== take.takeType) {
      return jsonError(400, "take_type_mismatch", "takeType must match the actual take type");
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
      include: { scene: { select: { episodeId: true } } },
    });
    const normalizedShot = await normalizeShotStateById(shotId);
    await recalculateEpisodeStage(shot.scene.episodeId);

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
