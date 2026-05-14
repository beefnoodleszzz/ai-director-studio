import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { templateId } = await params;
    const template = await prisma.promptTemplate.findUnique({ where: { id: templateId } });
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(template);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { templateId } = await params;
    const body = await req.json();
    const existing = await prisma.promptTemplate.findUnique({ where: { id: templateId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.promptTemplate.update({
      where: { id: templateId },
      data: {
        name: body.name ?? existing.name,
        category: body.category ?? existing.category,
        stylePrefix: body.stylePrefix ?? existing.stylePrefix,
        charAnchor: body.charAnchor ?? existing.charAnchor,
        shotDesc: body.shotDesc ?? existing.shotDesc,
        sceneDesc: body.sceneDesc ?? existing.sceneDesc,
        actionDesc: body.actionDesc ?? existing.actionDesc,
        emotionDesc: body.emotionDesc ?? existing.emotionDesc,
        qualitySuffix: body.qualitySuffix ?? existing.qualitySuffix,
        negativePrompt: body.negativePrompt ?? existing.negativePrompt,
        isActive: body.isActive ?? existing.isActive,
        version: existing.version + 1,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { templateId } = await params;
    await prisma.promptTemplate.delete({ where: { id: templateId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
