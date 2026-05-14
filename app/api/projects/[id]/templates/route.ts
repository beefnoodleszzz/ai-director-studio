import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const templates = await prisma.promptTemplate.findMany({
      where: { projectId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(templates);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await req.json();
    const template = await prisma.promptTemplate.create({
      data: {
        projectId,
        name: body.name ?? "未命名模板",
        category: body.category ?? "image",
        stylePrefix: body.stylePrefix ?? "",
        charAnchor: body.charAnchor ?? "",
        shotDesc: body.shotDesc ?? "",
        sceneDesc: body.sceneDesc ?? "",
        actionDesc: body.actionDesc ?? "",
        emotionDesc: body.emotionDesc ?? "",
        qualitySuffix: body.qualitySuffix ?? "",
        negativePrompt: body.negativePrompt ?? "",
        version: 1,
        isActive: true,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
