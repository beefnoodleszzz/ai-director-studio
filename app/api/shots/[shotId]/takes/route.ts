/**
 * Shot 下的 Takes 管理
 * GET  /api/shots/:shotId/takes       — 获取所有 takes
 * POST /api/shots/:shotId/takes/adopt — 指定采用的 take
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const takes = await prisma.take.findMany({
      where: { shotId },
      include: { reviews: { orderBy: { reviewedAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      takes.map((take) => {
        let paramsSnapshot: Record<string, unknown> | null = null;
        try {
          paramsSnapshot = take.paramsSnapshot ? JSON.parse(take.paramsSnapshot) : null;
        } catch {
          paramsSnapshot = null;
        }
        return {
          ...take,
          paramsSnapshotJson: paramsSnapshot,
        };
      })
    );
  } catch (err) {
    console.error("[GET /api/shots/:shotId/takes]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
