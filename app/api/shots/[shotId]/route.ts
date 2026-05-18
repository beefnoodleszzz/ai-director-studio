import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removePublicUrlIfExists } from "@/lib/asset";
import { normalizeShotStateById } from "@/lib/production-state";
import { parseBlockMeta } from "@/lib/studio-contracts";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const body = (await req.json()) as {
      autoContinue?: boolean;
      clearBlock?: boolean;
    };

    const shot = await prisma.shot.findUnique({ where: { id: shotId } });
    if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 });

    const updated = await prisma.shot.update({
      where: { id: shotId },
      data: {
        ...(body.autoContinue !== undefined ? { autoContinue: body.autoContinue } : {}),
        ...(body.clearBlock
          ? {
              blockReason: "",
              blockMeta: "",
            }
          : {}),
      },
    });
    const normalizedShot = body.clearBlock ? await normalizeShotStateById(shotId) : updated;

    return NextResponse.json({
      id: normalizedShot.id,
      autoContinue: normalizedShot.autoContinue,
      pipelineStage: normalizedShot.pipelineStage,
      blockReason: normalizedShot.blockReason,
      blockMeta: parseBlockMeta(normalizedShot.blockMeta),
    });
  } catch (err) {
    console.error("[PATCH /api/shots/:shotId]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const shot = await prisma.shot.findUnique({
      where: { id: shotId },
      include: { takes: true },
    });
    if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 });

    for (const take of shot.takes) {
      removePublicUrlIfExists(take.localImage);
      removePublicUrlIfExists(take.localVideo);
      removePublicUrlIfExists(take.localAudio);
    }

    await prisma.shot.delete({ where: { id: shotId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/shots/:shotId]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
