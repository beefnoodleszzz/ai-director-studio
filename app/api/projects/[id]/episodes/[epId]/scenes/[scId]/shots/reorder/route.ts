/**
 * 镜头排序 API
 *
 * 接收镜头 ID 数组（有序），批量更新 shotOrder 字段。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string; scId: string }> }
) {
  try {
    const { scId } = await params;
    const { shotIds } = await req.json() as { shotIds: string[] };

    if (!Array.isArray(shotIds) || shotIds.length === 0) {
      return NextResponse.json({ error: "shotIds required" }, { status: 400 });
    }

    // 验证这些 shot 都属于该 scene
    const shots = await prisma.shot.findMany({
      where: { id: { in: shotIds }, sceneId: scId },
      select: { id: true },
    });

    if (shots.length !== shotIds.length) {
      return NextResponse.json({ error: "Some shotIds are invalid or not in this scene" }, { status: 400 });
    }

    // 批量更新顺序
    await Promise.all(
      shotIds.map((shotId, index) =>
        prisma.shot.update({
          where: { id: shotId },
          data: { shotOrder: index + 1 },
        })
      )
    );

    return NextResponse.json({ ok: true, updatedCount: shotIds.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
