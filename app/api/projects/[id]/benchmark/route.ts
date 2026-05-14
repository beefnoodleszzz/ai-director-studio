import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface ProviderStat {
  provider: string;
  takeType: string;
  total: number;
  passed: number;
  failed: number;
  warned: number;
  passRate: number;
  avgScore: number;
  avgGenerationMs: number;
  avgRetries: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // 取该项目所有 takes（通过 Shot → Scene → Episode → Project）
    const takes = await prisma.take.findMany({
      where: {
        shot: {
          scene: {
            episode: { projectId },
          },
        },
        isDiscarded: false,
      },
      include: {
        reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
      },
    });

    // 按 provider + takeType 分组统计
    const map = new Map<string, ProviderStat>();

    for (const take of takes) {
      const key = `${take.provider}::${take.takeType}`;
      if (!map.has(key)) {
        map.set(key, {
          provider: take.provider || "unknown",
          takeType: take.takeType,
          total: 0,
          passed: 0,
          failed: 0,
          warned: 0,
          passRate: 0,
          avgScore: 0,
          avgGenerationMs: 0,
          avgRetries: 0,
        });
      }
      const stat = map.get(key)!;
      stat.total += 1;
      stat.avgScore += take.autoScore;
      stat.avgGenerationMs += take.generationMs;

      const verdict = take.reviews[0]?.verdict;
      if (verdict === "pass") stat.passed += 1;
      else if (verdict === "fail") stat.failed += 1;
      else if (verdict === "warn") stat.warned += 1;
    }

    // 计算平均值和通过率
    const stats: ProviderStat[] = [];
    for (const stat of map.values()) {
      if (stat.total > 0) {
        stat.passRate = Math.round((stat.passed / stat.total) * 100);
        stat.avgScore = Math.round((stat.avgScore / stat.total) * 100) / 100;
        stat.avgGenerationMs = Math.round(stat.avgGenerationMs / stat.total);
      }
      stats.push(stat);
    }

    // 任务层面：每个 provider 对应 shot 的平均 retries
    const tasks = await prisma.generationTask.findMany({
      where: { projectId, status: { in: ["completed", "failed"] } },
      select: { taskType: true, attempts: true, status: true },
    });

    const taskRetryMap = new Map<string, { total: number; attempts: number }>();
    for (const task of tasks) {
      const k = task.taskType;
      if (!taskRetryMap.has(k)) taskRetryMap.set(k, { total: 0, attempts: 0 });
      const s = taskRetryMap.get(k)!;
      s.total += 1;
      s.attempts += task.attempts;
    }

    for (const stat of stats) {
      const taskData = taskRetryMap.get(stat.takeType);
      if (taskData && taskData.total > 0) {
        stat.avgRetries = Math.round((taskData.attempts / taskData.total) * 10) / 10;
      }
    }

    stats.sort((a, b) => b.passRate - a.passRate);

    return NextResponse.json({ stats, totalTakes: takes.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
