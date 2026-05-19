import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removePublicUrlIfExists } from "@/lib/asset";
import { normalizeShotStateById } from "@/lib/production-state";
import { parseBlockMeta } from "@/lib/studio-contracts";
import { validateShotPatchBody } from "@/lib/route-validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const shot = await prisma.shot.findUnique({
      where: { id: shotId },
      include: {
        takes: {
          include: { reviews: { orderBy: { reviewedAt: "desc" }, take: 1 } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!shot) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...shot,
      blockMeta: parseBlockMeta(shot.blockMeta),
      takes: shot.takes.map((take) => {
        let paramsSnapshotJson: Record<string, unknown> | null = null;
        try {
          paramsSnapshotJson = take.paramsSnapshot ? JSON.parse(take.paramsSnapshot) : null;
        } catch {
          paramsSnapshotJson = null;
        }

        return {
          ...take,
          paramsSnapshotJson,
        };
      }),
    });
  } catch (err) {
    console.error("[GET /api/shots/:shotId]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const parsed = validateShotPatchBody(await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

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
