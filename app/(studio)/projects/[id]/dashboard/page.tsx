"use client";

import { use, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCcw, Film, Clapperboard, ListTodo, ArrowRight } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { cn } from "@/lib/utils";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

interface DashboardData {
  takeStats: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
    unreviewed: number;
    passRate: number;
    wastageRate: number;
  };
  shotStats: {
    total: number;
    draft: number;
    generating: number;
    imageDone: number;
    videoDone: number;
    failed: number;
  };
  taskStats: {
    total: number;
    completed: number;
    failed: number;
    queued: number;
    running: number;
    avgAttempts: number;
  };
  providerStats: Array<{
    provider: string;
    total: number;
    passRate: number;
    failRate: number;
    avgScore: number;
  }>;
}

export default function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [tick, setTick] = useState(0);
  const fetchData = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      try {
        const r = await axios.get<DashboardData>(`/api/projects/${projectId}/dashboard`);
        if (!cancelled) setData(r.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectId, tick]);

  if (loading || !data) {
    return (
      <div className="app-page-narrow py-8 space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
      </div>
    );
  }

  const { takeStats, shotStats, taskStats, providerStats } = data;

  return (
    <ProjectPageShell
      title="生产指标看板"
      description="实时查看废片率、通过率、任务负载与 Provider 表现，用桌面端一眼判断产线健康度。"
      backHref={`/projects/${projectId}`}
      contentClassName="app-page-narrow"
      actions={
        <Button variant="ghost" size="sm" onClick={fetchData}>
          <RefreshCcw className="size-4 mr-1.5" /> 刷新
        </Button>
      }
    >

      {/* ── Take 质量 ── */}
      <section className="space-y-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Take 质量</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="总 Take 数" value={takeStats.total} color="text-foreground" />
          <StatCard
            label="可用率"
            value={`${takeStats.passRate}%`}
            color={takeStats.passRate >= 70 ? "text-green-500" : takeStats.passRate >= 50 ? "text-amber-500" : "text-destructive"}
            subtitle={`${takeStats.passed} 通过 · ${takeStats.warned} 可接受`}
          />
          <Link href={`/projects/${projectId}/qa`}>
            <StatCard
              label="废片率 →"
              value={`${takeStats.wastageRate}%`}
              color={takeStats.wastageRate <= 20 ? "text-green-500" : takeStats.wastageRate <= 40 ? "text-amber-500" : "text-destructive"}
              subtitle={`点击前往 QA 面板`}
            />
          </Link>
          <Link href={`/projects/${projectId}/qa`}>
            <StatCard
              label="待审核 →"
              value={takeStats.unreviewed}
              color={takeStats.unreviewed > 0 ? "text-amber-500" : "text-muted-foreground"}
              subtitle="点击前往 QA 面板"
            />
          </Link>
        </div>

        {/* 可用率进度条 */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-3 text-green-500" /> 通过
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="size-3 text-amber-500" /> 可接受
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="size-3 text-destructive" /> 失败
            </span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${takeStats.total > 0 ? (takeStats.passed / takeStats.total) * 100 : 0}%` }}
            />
            <div
              className="bg-amber-500 transition-all"
              style={{ width: `${takeStats.total > 0 ? (takeStats.warned / takeStats.total) * 100 : 0}%` }}
            />
            <div
              className="bg-destructive transition-all"
              style={{ width: `${takeStats.total > 0 ? (takeStats.failed / takeStats.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── 镜头进度 ── */}
      <section className="space-y-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clapperboard className="size-4" /> 镜头进度
        </p>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { label: "总镜头", value: shotStats.total, color: "text-foreground" },
            { label: "草稿", value: shotStats.draft, color: "text-muted-foreground" },
            { label: "首帧完成", value: shotStats.imageDone, color: "text-sky-500" },
            { label: "视频完成", value: shotStats.videoDone, color: "text-green-500" },
            { label: "失败", value: shotStats.failed, color: "text-destructive" },
          ].map(({ label, value, color }) => (
            <StatCard key={label} label={label} value={value} color={color} />
          ))}
        </div>
        <Progress
          value={shotStats.total > 0 ? (shotStats.videoDone / shotStats.total) * 100 : 0}
          className="h-2"
        />
      </section>

      <Separator />

      {/* ── 任务统计 ── */}
      <section className="space-y-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <ListTodo className="size-4" /> 任务统计
        </p>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          <StatCard label="总任务" value={taskStats.total} color="text-foreground" />
          <StatCard label="已完成" value={taskStats.completed} color="text-green-500" />
          <Link href={`/projects/${projectId}/tasks`}>
            <StatCard
              label="失败 →"
              value={taskStats.failed}
              color={taskStats.failed > 0 ? "text-destructive" : "text-muted-foreground"}
              subtitle="点击前往任务中心"
            />
          </Link>
          <Link href={`/projects/${projectId}/tasks`}>
            <StatCard
              label="排队中 →"
              value={taskStats.queued}
              color={taskStats.queued > 0 ? "text-blue-500" : "text-muted-foreground"}
              subtitle="点击前往任务中心"
            />
          </Link>
          <StatCard
            label="平均重试"
            value={`${taskStats.avgAttempts}x`}
            color={taskStats.avgAttempts > 2 ? "text-amber-500" : "text-muted-foreground"}
          />
        </div>

        {/* 快捷跳转 */}
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${projectId}/qa`}>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              前往 QA 面板 <ArrowRight className="size-3" />
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/tasks`}>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              前往任务中心 <ArrowRight className="size-3" />
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/consistency`}>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              一致性报告 <ArrowRight className="size-3" />
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/benchmark`}>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              Provider 基准 <ArrowRight className="size-3" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Provider 对比 ── */}
      {providerStats.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Film className="size-4" /> Provider 效果对比
            </p>
            <div className="space-y-2">
              {providerStats.map((ps) => (
                <div key={ps.provider} className="flex items-center gap-4">
                  <Badge variant="secondary" className="font-mono text-xs w-28 justify-center shrink-0">
                    {ps.provider}
                  </Badge>
                  <div className="flex-1 space-y-0.5">
                    <Progress value={ps.passRate} className="h-2" />
                    <p className="text-[10px] text-muted-foreground">
                      {ps.total} takes · 可用率 {ps.passRate}% · 废片率 {ps.failRate}% · 均分 {ps.avgScore.toFixed(2)}
                    </p>
                  </div>
                  <span className={cn(
                    "text-sm font-semibold w-12 text-right shrink-0",
                    ps.passRate >= 70 ? "text-green-500" : ps.passRate >= 50 ? "text-amber-500" : "text-destructive"
                  )}>
                    {ps.passRate}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </ProjectPageShell>
  );
}

function StatCard({ label, value, color, subtitle }: {
  label: string;
  value: string | number;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className={cn("text-2xl font-bold", color)}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
