/**
 * 模板效果统计 API
 *
 * 从 GenerationTask.inputRef 中解析 templateId，
 * 关联对应 Take 的 Review 结果，汇总通过率/废片率/平均重试。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // 获取该项目所有模板
    const templates = await prisma.promptTemplate.findMany({
      where: { projectId },
      select: { id: true, name: true, category: true },
    });

    // 获取该项目所有生成任务（含 inputRef）
    const tasks = await prisma.generationTask.findMany({
      where: {
        projectId,
        taskType: "image",
        status: { in: ["completed", "failed"] },
      },
      select: {
        id: true,
        inputRef: true,
        attempts: true,
        status: true,
        shotId: true,
      },
    });

    // 按 templateId 聚合
    const statsMap = new Map<string, {
      total: number;
      passed: number;
      failed: number;
      retries: number;
    }>();

    for (const task of tasks) {
      let templateId: string | null = null;
      try {
        const input = JSON.parse(task.inputRef || "{}") as { templateId?: string };
        templateId = input.templateId ?? null;
      } catch { /* noop */ }

      if (!templateId) continue;

      if (!statsMap.has(templateId)) {
        statsMap.set(templateId, { total: 0, passed: 0, failed: 0, retries: 0 });
      }

      const s = statsMap.get(templateId)!;
      s.total += 1;
      s.retries += Math.max(0, task.attempts - 1);

      // 关联 take 的 review
      if (task.shotId) {
        const take = await prisma.take.findFirst({
          where: { shotId: task.shotId, isDiscarded: false },
          include: { reviews: { orderBy: { reviewedAt: "desc" }, take: 1 } },
        });
        const verdict = take?.reviews[0]?.verdict;
        if (verdict === "pass" || verdict === "warn") s.passed += 1;
        else if (verdict === "fail") s.failed += 1;
      }
    }

    const result = templates.map((tpl) => {
      const s = statsMap.get(tpl.id) ?? { total: 0, passed: 0, failed: 0, retries: 0 };
      return {
        templateId: tpl.id,
        templateName: tpl.name,
        category: tpl.category,
        total: s.total,
        passRate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : null,
        wastageRate: s.total > 0 ? Math.round((s.failed / s.total) * 100) : null,
        avgRetries: s.total > 0 ? Math.round((s.retries / s.total) * 10) / 10 : null,
      };
    }).sort((a, b) => (b.passRate ?? -1) - (a.passRate ?? -1));

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
