/**
 * 批量生成：为场景内所有 draft/pending 状态镜头批量触发图像生成
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShotImagesWithTask } from "@/lib/workflows/image-generation";
import { validateBatchImageGenerationBody } from "@/lib/route-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string; scId: string }> }
) {
  try {
    const { id: projectId, epId: episodeId, scId: sceneId } = await params;
    const parsed = validateBatchImageGenerationBody(await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
    const { onlyFailed = false, provider, candidateCount = 2 } = body;

    // 查询场次内所有镜头
    const shots = await prisma.shot.findMany({
      where: {
        sceneId,
        ...(body.shotIds?.length ? { id: { in: body.shotIds } } : {}),
      },
      include: {
        takes: {
          where: { takeType: "image", isDiscarded: false },
          include: { reviews: { orderBy: { reviewedAt: "desc" }, take: 1 } },
        },
      },
      orderBy: { shotOrder: "asc" },
    });

    // 过滤：onlyFailed 时只处理已有失败 take 或没有 take 的镜头
    const targets = onlyFailed
      ? shots.filter((s) => {
          if (s.takes.length === 0) return true;
          return s.takes.some((t) => t.reviews[0]?.verdict === "fail");
        })
      : shots.filter((s) => !s.takes.some((t) => t.isAdopted));

    if (targets.length === 0) {
      return NextResponse.json({ queued: 0, message: "无需处理的镜头" });
    }

    // 异步触发，不等待完成
    const taskIds: string[] = [];
    for (const shot of targets) {
      try {
        const { taskId } = await generateShotImagesWithTask({
          projectId,
          episodeId,
          sceneId,
          shotId: shot.id,
          prompt: shot.visualPrompt,
          provider: provider ?? "sakura",
          candidateCount,
        });
        taskIds.push(taskId);
      } catch {
        // 单个失败不阻断其余
      }
    }

    return NextResponse.json({
      queued: taskIds.length,
      taskIds,
      total: targets.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
