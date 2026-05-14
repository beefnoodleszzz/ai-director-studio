"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  RefreshCcw,
  Users,
} from "lucide-react";
import axios from "axios";
import { cn } from "@/lib/utils";

interface IssueEntry {
  episodeNum: number;
  sceneOrder: number;
  shotOrder: number;
  takeId: string;
  failTags: string[];
  details: string;
  generatedAt: string;
}

interface CharacterReport {
  characterId: string;
  characterName: string;
  totalShots: number;
  totalTakes: number;
  consistencyIssues: number;
  consistencyRate: number;
  recentIssues: IssueEntry[];
}

interface Props {
  projectId: string;
}

const TAG_LABELS: Record<string, string> = {
  "face-inconsistency": "脸部不一致",
  "wardrobe-drift": "服装漂移",
  "identity-unstable": "身份不稳定",
  "character-mismatch": "角色误认",
  "hairstyle-changed": "发型改变",
};

export function ConsistencyReport({ projectId }: Props) {
  const [reports, setReports] = useState<CharacterReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [openChars, setOpenChars] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  const fetchReports = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      try {
        const r = await axios.get<CharacterReport[]>(`/api/projects/${projectId}/consistency`);
        if (!cancelled) setReports(r.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectId, tick]);

  const toggleChar = (charId: string) => {
    setOpenChars((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  };

  const overallRate =
    reports.length > 0
      ? Math.round(
          reports.reduce((acc, r) => acc + r.consistencyRate, 0) / reports.length
        )
      : 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">角色跨集一致性报告</p>
            <p className="text-xs text-muted-foreground">
              {reports.length} 个角色 · 整体一致率{" "}
              <span
                className={cn(
                  "font-medium",
                  overallRate >= 80 ? "text-green-500" : overallRate >= 60 ? "text-amber-500" : "text-destructive"
                )}
              >
                {overallRate}%
              </span>
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchReports}>
          <RefreshCcw className="size-4 mr-1.5" /> 刷新
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            <Users className="size-8 mx-auto mb-3 opacity-30" />
            <p>暂无数据</p>
            <p className="text-xs mt-1">生成角色相关图像并完成 QA 后，数据会自动积累</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Collapsible
              key={report.characterId}
              open={openChars.has(report.characterId)}
              onOpenChange={() => toggleChar(report.characterId)}
            >
              <Card>
                <CollapsibleTrigger className="w-full text-left">
                  <CardContent className="pt-4 pb-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4">
                      {/* 角色名和徽章 */}
                      <div className="flex items-center gap-2 w-36 shrink-0">
                        <p className="font-medium text-sm truncate">{report.characterName}</p>
                        {report.consistencyIssues > 0 ? (
                          <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                        ) : (
                          <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                        )}
                      </div>

                      {/* 一致率进度条 */}
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{report.totalTakes} 个 Take · {report.totalShots} 个镜头</span>
                          <span
                            className={cn(
                              "font-medium",
                              report.consistencyRate >= 80 ? "text-green-500" :
                              report.consistencyRate >= 60 ? "text-amber-500" : "text-destructive"
                            )}
                          >
                            {report.consistencyRate}%
                          </span>
                        </div>
                        <Progress value={report.consistencyRate} className="h-1.5" />
                      </div>

                      {/* 问题数 */}
                      <div className="text-right shrink-0">
                        {report.consistencyIssues > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {report.consistencyIssues} 处问题
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                            无问题
                          </Badge>
                        )}
                      </div>

                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform shrink-0",
                          openChars.has(report.characterId) && "rotate-180"
                        )}
                      />
                    </div>
                  </CardContent>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-2 border-t pt-3">
                    {report.recentIssues.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">无一致性问题</p>
                    ) : (
                      report.recentIssues.map((issue, i) => (
                        <div
                          key={`${issue.takeId}-${i}`}
                          className="flex items-start gap-3 text-xs bg-muted/30 rounded-lg px-3 py-2"
                        >
                          <span className="text-muted-foreground font-mono shrink-0">
                            EP{issue.episodeNum} SC{issue.sceneOrder.toString().padStart(2, "0")} SH{issue.shotOrder.toString().padStart(2, "0")}
                          </span>
                          <div className="flex flex-wrap gap-1 flex-1">
                            {issue.failTags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                                {TAG_LABELS[tag] ?? tag}
                              </Badge>
                            ))}
                            {issue.details && (
                              <span className="text-muted-foreground ml-1">{issue.details}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
