/**
 * 从全局模板库克隆模板到当前项目
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const GLOBAL_PROJECT_ID = "__global__";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { templateIds } = await req.json() as { templateIds: string[] };

    if (!templateIds?.length) {
      return NextResponse.json({ error: "templateIds required" }, { status: 400 });
    }

    const globals = await prisma.promptTemplate.findMany({
      where: { id: { in: templateIds }, projectId: GLOBAL_PROJECT_ID },
    });

    const cloned = await Promise.all(
      globals.map((tpl) =>
        prisma.promptTemplate.create({
          data: {
            projectId,
            name: `${tpl.name}（克隆）`,
            category: tpl.category,
            stylePrefix: tpl.stylePrefix,
            charAnchor: tpl.charAnchor,
            shotDesc: tpl.shotDesc,
            sceneDesc: tpl.sceneDesc,
            actionDesc: tpl.actionDesc,
            emotionDesc: tpl.emotionDesc,
            qualitySuffix: tpl.qualitySuffix,
            negativePrompt: tpl.negativePrompt,
            version: 1,
            isActive: true,
          },
        })
      )
    );

    return NextResponse.json({ cloned: cloned.length, templates: cloned });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
