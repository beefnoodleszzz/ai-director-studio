/**
 * 手动指定采用的 Take
 * POST /api/shots/:shotId/adopt { takeId }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const { takeId } = (await req.json()) as { takeId: string };

    if (!takeId) {
      return NextResponse.json({ error: "takeId is required" }, { status: 400 });
    }

    // 清除旧采用
    await prisma.take.updateMany({
      where: { shotId, isAdopted: true },
      data: { isAdopted: false },
    });

    // 设置新采用
    await prisma.take.update({
      where: { id: takeId },
      data: { isAdopted: true, isDiscarded: false },
    });

    await prisma.shot.update({
      where: { id: shotId },
      data: { adoptedTakeId: takeId },
    });

    return NextResponse.json({ success: true, adoptedTakeId: takeId });
  } catch (err) {
    console.error("[POST /api/shots/:shotId/adopt]", err);
    return NextResponse.json({ error: "Failed to adopt take" }, { status: 500 });
  }
}
