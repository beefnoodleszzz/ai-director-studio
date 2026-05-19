/**
 * 镜头对白修正 API
 *
 * PATCH /api/shots/{shotId}/dialogue
 *   - 支持整段替换（dialogue 字段）
 *   - 支持句级修正（sentenceIndex + newText）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, validateShotDialoguePatchBody } from "@/lib/route-validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const parsed = validateShotDialoguePatchBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

    const shot = await prisma.shot.findUnique({ where: { id: shotId } });
    if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 });

    let newDialogue = shot.dialogue ?? "";

    if (body.sentenceIndex !== undefined && body.newSentenceText !== undefined) {
      // 句级修正：按句分割（中文「。」「！」「？」或换行），修改指定句
      const sentences = newDialogue.split(/(?<=[。！？\n])/);
      if (body.sentenceIndex >= sentences.length) {
        return jsonError(400, "sentence_index_out_of_range", "sentenceIndex is out of range for the current dialogue");
      }
      sentences[body.sentenceIndex] = body.newSentenceText;
      newDialogue = sentences.join("");
    } else if (body.dialogue !== undefined) {
      newDialogue = body.dialogue;
    }

    const updated = await prisma.shot.update({
      where: { id: shotId },
      data: {
        dialogue: newDialogue,
        ...(body.audioPrompt !== undefined ? { audioPrompt: body.audioPrompt } : {}),
      },
    });

    return NextResponse.json({ id: updated.id, dialogue: updated.dialogue, audioPrompt: updated.audioPrompt });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
