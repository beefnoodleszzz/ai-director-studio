import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string; scId: string }> }
) {
  try {
    const { scId } = await params;
    const { emotionArc, emotionIntensity } = await req.json() as {
      emotionArc?: string;
      emotionIntensity?: number; // 0-10
    };

    const scene = await prisma.scene.findUnique({ where: { id: scId } });
    if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

    const updated = await prisma.scene.update({
      where: { id: scId },
      data: {
        ...(emotionArc !== undefined ? { emotionArc } : {}),
        ...(emotionIntensity !== undefined ? { plotPurpose: `intensity:${emotionIntensity};${scene.plotPurpose ?? ""}`.substring(0, 500) } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      emotionArc: updated.emotionArc,
      plotPurpose: updated.plotPurpose,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
