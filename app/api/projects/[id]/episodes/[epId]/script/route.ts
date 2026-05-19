import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateEpisodeStage } from "@/lib/production-state";
import { evaluateManualScriptDraft } from "@/lib/workflows/story-workflow";
import { validateEpisodeScriptPatchBody } from "@/lib/route-validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string }> }
) {
  try {
    const { id: projectId, epId } = await params;
    const parsed = validateEpisodeScriptPatchBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

    const episodeRecord = await prisma.episode.findFirst({
      where: { id: epId, projectId },
      select: { id: true },
    });
    if (!episodeRecord) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let nextScriptDraft = body.scriptDraft;
    let nextScriptMeta = body.scriptMeta;
    let blockers: Array<{ code: string; title: string; detail: string }> = [];

    if (body.scriptDraft !== undefined) {
      const evaluated = await evaluateManualScriptDraft({
        projectId,
        episodeId: epId,
        scriptDraft: body.scriptDraft,
      });
      nextScriptDraft = evaluated.scriptDraft;
      nextScriptMeta = JSON.stringify(evaluated.meta);
      blockers = evaluated.blockers;
    }

    await prisma.episode.update({
      where: { id: epId },
      data: {
        ...(nextScriptDraft !== undefined ? { scriptDraft: nextScriptDraft } : {}),
        ...(nextScriptMeta !== undefined ? { scriptMeta: nextScriptMeta } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.hook !== undefined ? { hook: body.hook } : {}),
        ...(body.cliffhanger !== undefined ? { cliffhanger: body.cliffhanger } : {}),
        ...(body.scriptSource !== undefined ? { scriptSource: body.scriptSource } : {}),
      },
    });
    const normalized = await recalculateEpisodeStage(epId);

    return NextResponse.json({
      ...normalized,
      scriptDraft: nextScriptDraft,
      scriptMeta: nextScriptMeta ? JSON.parse(nextScriptMeta) : null,
      blockers,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
