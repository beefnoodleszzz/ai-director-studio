/**
 * 项目统计看板 API
 *
 * 汇总废片率、通过率、provider 效果对比等关键生产指标。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // 所有未废弃 take
    const takes = await prisma.take.findMany({
      where: {
        shot: { scene: { episode: { projectId } } },
        isDiscarded: false,
      },
      include: {
        reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
      },
    });

    const total = takes.length;
    let passed = 0, warned = 0, failed = 0, unreviewed = 0;
    const providerMap = new Map<string, { total: number; passed: number; failed: number; scoreSum: number }>();

    for (const take of takes) {
      const verdict = take.reviews[0]?.verdict;
      if (verdict === "pass") passed += 1;
      else if (verdict === "warn") warned += 1;
      else if (verdict === "fail") failed += 1;
      else unreviewed += 1;

      const p = take.provider || "unknown";
      if (!providerMap.has(p)) providerMap.set(p, { total: 0, passed: 0, failed: 0, scoreSum: 0 });
      const ps = providerMap.get(p)!;
      ps.total += 1;
      ps.scoreSum += take.autoScore;
      if (verdict === "pass" || verdict === "warn") ps.passed += 1;
      else if (verdict === "fail") ps.failed += 1;
    }

    // 镜头数据
    const shots = await prisma.shot.findMany({
      where: { scene: { episode: { projectId } } },
      select: { id: true, status: true },
    });

    const shotStats = {
      total: shots.length,
      draft: shots.filter((s) => s.status === "draft").length,
      generating: shots.filter((s) => s.status === "generating").length,
      imageDone: shots.filter((s) => s.status === "image_done").length,
      videoDone: shots.filter((s) => s.status === "video_done").length,
      failed: shots.filter((s) => s.status === "failed").length,
    };

    // 任务数据
    const tasks = await prisma.generationTask.findMany({
      where: { projectId },
      select: { status: true, taskType: true, attempts: true },
    });

    const taskStats = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      queued: tasks.filter((t) => t.status === "queued").length,
      running: tasks.filter((t) => ["running", "retrying"].includes(t.status)).length,
      avgAttempts: tasks.length > 0
        ? Math.round((tasks.reduce((a, t) => a + t.attempts, 0) / tasks.length) * 10) / 10
        : 0,
    };

    const providerStats = Array.from(providerMap.entries()).map(([provider, data]) => ({
      provider,
      total: data.total,
      passRate: data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0,
      failRate: data.total > 0 ? Math.round((data.failed / data.total) * 100) : 0,
      avgScore: data.total > 0 ? Math.round((data.scoreSum / data.total) * 100) / 100 : 0,
    })).sort((a, b) => b.passRate - a.passRate);

    return NextResponse.json({
      takeStats: {
        total,
        passed,
        warned,
        failed,
        unreviewed,
        passRate: total > 0 ? Math.round(((passed + warned) / total) * 100) : 0,
        wastageRate: total > 0 ? Math.round((failed / total) * 100) : 0,
      },
      shotStats,
      taskStats,
      providerStats,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
