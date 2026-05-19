/**
 * 项目统计看板 API
 *
 * 汇总废片率、通过率、provider 效果对比等关键生产指标。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildDashboardProviderStats,
  type DashboardData,
  type ProviderAggregateInput,
} from "@/lib/contracts/dashboard";

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
    const providerMap = new Map<string, ProviderAggregateInput>();

    for (const take of takes) {
      const verdict = take.reviews[0]?.verdict;
      if (verdict === "pass") passed += 1;
      else if (verdict === "warn") warned += 1;
      else if (verdict === "fail") failed += 1;
      else unreviewed += 1;

      const p = take.provider || "unknown";
      if (!providerMap.has(p)) {
        providerMap.set(p, {
          provider: p,
          total: 0,
          passed: 0,
          warned: 0,
          failed: 0,
          scoreSum: 0,
        });
      }
      const ps = providerMap.get(p)!;
      ps.total += 1;
      ps.scoreSum += take.autoScore;
      if (verdict === "pass") ps.passed += 1;
      else if (verdict === "warn") ps.warned += 1;
      else if (verdict === "fail") ps.failed += 1;
    }

    // 镜头数据
    const shots = await prisma.shot.findMany({
      where: { scene: { episode: { projectId } } },
      select: {
        id: true,
        pipelineStage: true,
        exportReadiness: true,
        dramaticTag: true,
        adoptedVideoTakeId: true,
        adoptedAudioTakeId: true,
        scene: {
          select: {
            episode: {
              select: {
                scriptMeta: true,
              },
            },
          },
        },
      },
    });

    const shotStats: DashboardData["shotStats"] = {
      total: shots.length,
      draft: shots.filter((s) => s.pipelineStage === "draft").length,
      generating: shots.filter((s) => s.pipelineStage?.endsWith("_generating")).length,
      imageReady: shots.filter((s) => s.pipelineStage === "image_ready").length,
      videoReady: shots.filter((s) => s.pipelineStage === "video_ready" || s.pipelineStage === "ready_for_export").length,
      blocked: shots.filter((s) => s.exportReadiness === "blocked").length,
    };

    const episodeScriptMeta = shots
      .map((shot) => shot.scene.episode.scriptMeta)
      .filter(Boolean)
      .map((raw) => {
        try {
          return JSON.parse(raw) as {
            stats?: {
              hookPass?: boolean;
              escalationPass?: boolean;
              cliffhangerPass?: boolean;
            };
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const criticalShots = shots.filter((shot) => ["hook-shot", "counter-shot", "cliff-shot"].includes(shot.dramaticTag));
    const contentStats = {
      hookPassRate:
        episodeScriptMeta.length > 0
          ? Math.round((episodeScriptMeta.filter((item) => item?.stats?.hookPass).length / episodeScriptMeta.length) * 100)
          : 0,
      escalationPassRate:
        episodeScriptMeta.length > 0
          ? Math.round((episodeScriptMeta.filter((item) => item?.stats?.escalationPass).length / episodeScriptMeta.length) * 100)
          : 0,
      cliffhangerPassRate:
        episodeScriptMeta.length > 0
          ? Math.round((episodeScriptMeta.filter((item) => item?.stats?.cliffhangerPass).length / episodeScriptMeta.length) * 100)
          : 0,
      criticalVideoRate:
        criticalShots.length > 0
          ? Math.round((criticalShots.filter((shot) => Boolean(shot.adoptedVideoTakeId)).length / criticalShots.length) * 100)
          : 0,
      dialogueCoverageRate:
        shots.length > 0
          ? Math.round((shots.filter((shot) => Boolean(shot.adoptedAudioTakeId)).length / shots.length) * 100)
          : 0,
    };

    // 任务数据
    const tasks = await prisma.generationTask.findMany({
      where: { projectId },
      select: { status: true, taskType: true, attempts: true },
    });

    const taskStats: DashboardData["taskStats"] = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      queued: tasks.filter((t) => t.status === "queued").length,
      running: tasks.filter((t) => ["running", "retrying"].includes(t.status)).length,
      avgAttempts: tasks.length > 0
        ? Math.round((tasks.reduce((a, t) => a + t.attempts, 0) / tasks.length) * 10) / 10
        : 0,
    };

    const providerStats = buildDashboardProviderStats(providerMap);

    const payload: DashboardData = {
      takeStats: {
        total,
        passed,
        warned,
        failed,
        unreviewed,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
        warnRate: total > 0 ? Math.round((warned / total) * 100) : 0,
        wastageRate: total > 0 ? Math.round((failed / total) * 100) : 0,
      },
      shotStats,
      taskStats,
      providerStats,
      contentStats,
    };

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
