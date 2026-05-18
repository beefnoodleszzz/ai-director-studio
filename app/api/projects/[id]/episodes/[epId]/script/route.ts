import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateEpisodeStage } from "@/lib/production-state";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string }> }
) {
  try {
    const { epId } = await params;
    const body = (await req.json()) as {
      scriptDraft?: string;
      title?: string;
      summary?: string;
      hook?: string;
      cliffhanger?: string;
      scriptSource?: string;
    };

    await prisma.episode.update({
      where: { id: epId },
      data: {
        ...(body.scriptDraft !== undefined ? { scriptDraft: body.scriptDraft } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.hook !== undefined ? { hook: body.hook } : {}),
        ...(body.cliffhanger !== undefined ? { cliffhanger: body.cliffhanger } : {}),
        ...(body.scriptSource !== undefined ? { scriptSource: body.scriptSource } : {}),
      },
    });
    const normalized = await recalculateEpisodeStage(epId);

    return NextResponse.json(normalized);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
