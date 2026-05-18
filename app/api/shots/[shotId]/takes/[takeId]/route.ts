/**
 * Take 更新 API
 *
 * PATCH /api/shots/{shotId}/takes/{takeId}
 *   - isDiscarded: true/false
 *   - discardReason?: string
 *
 * 当废弃当前采用的 take 时，同时清空：
 *   - take.isAdopted
 *   - 对应的 shot 采用字段
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeShotStateById } from "@/lib/production-state";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string; takeId: string }> }
) {
  try {
    const { shotId, takeId } = await params;
    const body = await req.json() as {
      isDiscarded?: boolean;
      discardReason?: string;
    };

    const take = await prisma.take.findUnique({ where: { id: takeId } });
    if (!take || take.shotId !== shotId) {
      return NextResponse.json({ error: "Take not found" }, { status: 404 });
    }

    const isDiscarding = body.isDiscarded === true && !take.isDiscarded;

    // 若废弃的是当前 adopted take，清除 take.isAdopted 并清空对应采用字段
    if (isDiscarding && take.isAdopted) {
      await prisma.take.updateMany({
        where: { shotId, takeType: take.takeType, isAdopted: true },
        data: { isAdopted: false },
      });

      const clearPatch =
        take.takeType === "image"
          ? { adoptedImageTakeId: null }
          : take.takeType === "video"
            ? { adoptedVideoTakeId: null }
            : take.takeType === "audio"
              ? { adoptedAudioTakeId: null }
              : {};

      await prisma.shot.update({
        where: { id: shotId },
        data: clearPatch,
      });
      await normalizeShotStateById(shotId);
    }

    const updated = await prisma.take.update({
      where: { id: takeId },
      data: {
        ...(body.isDiscarded !== undefined ? { isDiscarded: body.isDiscarded } : {}),
        ...(body.discardReason !== undefined ? { discardReason: body.discardReason } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      isDiscarded: updated.isDiscarded,
      isAdopted: updated.isAdopted,
      discardReason: updated.discardReason,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
