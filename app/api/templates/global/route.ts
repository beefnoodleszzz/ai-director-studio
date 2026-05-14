/**
 * 全局模板库
 *
 * 不绑定任何项目的公共 Prompt 模板（projectId = "__global__"）。
 * 用于跨项目复用风格和镜头描述。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const GLOBAL_PROJECT_ID = "__global__";

export async function GET() {
  try {
    const templates = await prisma.promptTemplate.findMany({
      where: { projectId: GLOBAL_PROJECT_ID },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(templates);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const template = await prisma.promptTemplate.create({
      data: {
        projectId: GLOBAL_PROJECT_ID,
        name: body.name ?? "全局模板",
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
