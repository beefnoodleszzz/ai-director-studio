import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removePublicUrlIfExists } from "@/lib/asset";
import { evaluateShotRisk } from "@/lib/shot-risk";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string; scId: string }> }
) {
  try {
    const { scId } = await params;
    const scene = await prisma.scene.findUnique({
      where: { id: scId },
      include: {
        shots: {
          orderBy: { shotOrder: "asc" },
          include: {
            takes: {
              orderBy: { createdAt: "desc" },
              include: {
                reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...scene,
      shots: scene.shots.map((shot) => ({
        ...shot,
        risk: evaluateShotRisk({
          dramaticTag: shot.dramaticTag,
          adoptedImageTakeId: shot.adoptedImageTakeId,
          adoptedVideoTakeId: shot.adoptedVideoTakeId,
        }),
      })),
    });
  } catch (err) {
    console.error("[GET scene]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string; scId: string }> }
) {
  try {
    const { scId } = await params;
    const scene = await prisma.scene.findUnique({
      where: { id: scId },
      include: {
        shots: {
          include: {
            takes: true,
          },
        },
      },
    });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

    for (const shot of scene.shots) {
      for (const take of shot.takes) {
        removePublicUrlIfExists(take.localImage);
        removePublicUrlIfExists(take.localVideo);
        removePublicUrlIfExists(take.localAudio);
      }
    }

    await prisma.scene.delete({ where: { id: scId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE scene]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
