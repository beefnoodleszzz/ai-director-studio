"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCcw } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";

interface ProviderStat {
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

interface Props {
  projectId: string;
}

const TYPE_LABELS: Record<string, string> = {
  image: "图像",
  video: "视频",
  audio: "音频/TTS",
  sfx: "音效",
  bgm: "BGM",
};

function msToReadable(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

export function ProviderBenchmark({ projectId }: Props) {
  const [stats, setStats] = useState<ProviderStat[]>([]);
  const [totalTakes, setTotalTakes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  // tick 变化时重新拉取数据；tick=0 是初次加载，手动刷新时递增
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.resolve(); // 让 useEffect 先完成同步阶段，再 setState
      if (cancelled) return;
      setLoading(true);
      try {
        const r = await axios.get<{ stats: ProviderStat[]; totalTakes: number }>(
          `/api/projects/${projectId}/benchmark`
        );
        if (!cancelled) {
          setStats(r.data.stats);
          setTotalTakes(r.data.totalTakes);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectId, tick]);

  const fetchStats = () => setTick((t) => t + 1);

  const grouped = stats.reduce<Record<string, ProviderStat[]>>((acc, s) => {
    if (!acc[s.takeType]) acc[s.takeType] = [];
    acc[s.takeType].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/15 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">Provider 效果基准</p>
            <p className="type-meta text-muted-foreground">
              共统计 {totalTakes} 个 Take · 数据来自实际生成记录
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchStats}>
          <RefreshCcw className="size-4 mr-1.5" /> 刷新
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : stats.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            <BarChart2 className="size-8 mx-auto mb-3 opacity-30" />
            <p>暂无统计数据</p>
            <p className="type-meta mt-1">生成一些 Take 后数据会自动积累</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([takeType, items]) => (
          <div key={takeType} className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              {TYPE_LABELS[takeType] ?? takeType} 生成
            </p>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {items.map((stat) => (
                <Card key={`${stat.provider}-${stat.takeType}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {stat.provider || "unknown"}
                          </Badge>
                          <span className="type-meta text-muted-foreground">
                            {stat.total} 次生成
                          </span>
                        </div>

                        {/* 通过率进度条 */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between type-meta">
                            <span className="text-muted-foreground">通过率</span>
                            <span className={stat.passRate >= 70 ? "text-green-500 font-medium" : stat.passRate >= 40 ? "text-amber-500 font-medium" : "text-destructive font-medium"}>
                              {stat.passRate}%
                            </span>
                          </div>
                          <Progress
                            value={stat.passRate}
                            className="h-1.5"
                          />
                        </div>
                      </div>

                      {/* 统计数字 */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 type-meta shrink-0">
                        <div className="flex items-center gap-1 text-green-500">
                          <CheckCircle2 className="size-3" />
                          <span>{stat.passed} 通过</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-500">
                          <AlertTriangle className="size-3" />
                          <span>{stat.warned} 可接受</span>
                        </div>
                        <div className="flex items-center gap-1 text-destructive">
                          <XCircle className="size-3" />
                          <span>{stat.failed} 失败</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="size-3" />
                          <span>{msToReadable(stat.avgGenerationMs)}</span>
                        </div>
                        <div className="col-span-2 text-muted-foreground">
                          平均重试 {stat.avgRetries.toFixed(1)} 次 · 均分 {stat.avgScore.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
