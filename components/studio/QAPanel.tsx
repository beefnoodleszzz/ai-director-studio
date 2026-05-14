"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Loader2,
  Filter,
  RefreshCcw,
  ImageIcon,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Verdict = "pass" | "warn" | "fail" | "all";

interface QAItem {
  // 路由上下文
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  adoptedImageTakeId: string | null;
  visualPrompt: string;
  // 展示字段
  shotOrder: number;
  shotType: string;
  sceneOrder: number;
  location: string;
  take: {
    id: string;
    takeType: string;
    provider: string;
    localImage: string | null;
    localVideo: string | null;
    autoScore: number;
    isAdopted: boolean;
  };
  review: {
    id: string;
    reviewType: string;
    verdict: string;
    score: number;
    failTags: string;
    suggestion: string;
    details: string;
  };
}

interface Props {
  projectId: string;
  episodeId?: string;
}

const verdictConfig = {
  pass: { label: "通过", icon: CheckCircle2, color: "text-green-500", badgeVariant: "default" as const },
  warn: { label: "可接受", icon: AlertTriangle, color: "text-amber-500", badgeVariant: "secondary" as const },
  fail: { label: "需重做", icon: XCircle, color: "text-destructive", badgeVariant: "destructive" as const },
};

const suggestionLabels: Record<string, string> = {
  adopt: "直接采用",
  "accept-minor": "轻微可接受",
  "must-redo": "必须重做",
  "change-provider": "换 Provider 重做",
};

export function QAPanel({ projectId, episodeId }: Props) {
  const [items, setItems] = useState<QAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Verdict>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [batchRetrying, setBatchRetrying] = useState(false);
  const [tick, setTick] = useState(0);

  const fetchQAItems = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const url = episodeId
          ? `/api/projects/${projectId}/qa?episodeId=${episodeId}`
          : `/api/projects/${projectId}/qa`;
        const res = await axios.get<QAItem[]>(url);
        if (!cancelled) setItems(res.data);
      } catch {
        if (!cancelled) toast.error("加载 QA 数据失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectId, episodeId, tick]);

  const handleRetry = async (item: QAItem) => {
    setRetrying((prev) => new Set(prev).add(item.take.id));
    try {
      if (item.take.takeType === "image") {
        await axios.post("/api/generate/image", {
          projectId: item.projectId,
          episodeId: item.episodeId,
          sceneId: item.sceneId,
          shotId: item.shotId,
          provider: item.take.provider,
          candidateCount: 1,
        });
      } else if (item.take.takeType === "video") {
        if (!item.adoptedImageTakeId) {
          toast.error("该镜头没有已采用的图片 take，无法生成视频");
          return;
        }
        await axios.post("/api/generate/video", {
          projectId: item.projectId,
          episodeId: item.episodeId,
          sceneId: item.sceneId,
          shotId: item.shotId,
          adoptedTakeId: item.adoptedImageTakeId,
          visualPrompt: item.visualPrompt,
          provider: item.take.provider,
        });
      } else if (item.take.takeType === "audio") {
        await axios.post("/api/generate/audio", {
          projectId: item.projectId,
          episodeId: item.episodeId,
          sceneId: item.sceneId,
          shotId: item.shotId,
          provider: item.take.provider,
        });
      }
      toast.success("已加入重新生成队列");
      fetchQAItems();
    } catch {
      toast.error("重新生成失败");
    } finally {
      setRetrying((prev) => { const next = new Set(prev); next.delete(item.take.id); return next; });
    }
  };

  const handleAcceptMinor = async (item: QAItem) => {
    try {
      // 更新 Review：verdict 改为 warn，suggestion 改为 accept-minor
      await axios.patch(`/api/projects/${projectId}/qa`, {
        reviewId: item.review.id,
        verdict: "warn",
        suggestion: "accept-minor",
      });
      setItems((prev) =>
        prev.map((it) =>
          it.review.id === item.review.id
            ? { ...it, review: { ...it.review, verdict: "warn", suggestion: "accept-minor" } }
            : it
        )
      );
      toast.success("已标记为接受瑕疵");
    } catch {
      toast.error("操作失败");
    }
  };

  const handleBatchRetry = async () => {
    const failedTakeIds = filteredItems
      .filter((item) => item.review.verdict === "fail")
      .map((item) => item.take.id);

    if (!failedTakeIds.length) {
      toast.info("当前筛选范围内没有失败项");
      return;
    }
    setBatchRetrying(true);
    try {
      const res = await axios.post<{ queued: number }>(
        `/api/projects/${projectId}/qa/batch-retry`,
        { takeIds: failedTakeIds }
      );
      toast.success(`已提交 ${res.data.queued} 个失败镜头至重做队列`);
    } catch {
      toast.error("批量重做失败");
    } finally {
      setBatchRetrying(false);
    }
  };

  // 收集所有出现过的 failTags（用于动态筛选）
  const allFailTags = Array.from(
    new Set(
      items.flatMap((item) => {
        try { return JSON.parse(item.review.failTags || "[]") as string[]; } catch { return []; }
      })
    )
  );

  const filteredItems = items.filter((item) => {
    if (filter !== "all" && item.review.verdict !== filter) return false;
    if (typeFilter !== "all" && item.take.takeType !== typeFilter) return false;
    if (tagFilter !== "all") {
      const tags: string[] = (() => { try { return JSON.parse(item.review.failTags || "[]"); } catch { return []; } })();
      if (!tags.includes(tagFilter)) return false;
    }
    return true;
  });

  const stats = {
    total: items.length,
    pass: items.filter((i) => i.review.verdict === "pass").length,
    warn: items.filter((i) => i.review.verdict === "warn").length,
    fail: items.filter((i) => i.review.verdict === "fail").length,
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "全部", value: stats.total, key: "all", color: "text-foreground" },
          { label: "通过", value: stats.pass, key: "pass", color: "text-green-500" },
          { label: "可接受", value: stats.warn, key: "warn", color: "text-amber-500" },
          { label: "需重做", value: stats.fail, key: "fail", color: "text-destructive" },
        ].map(({ label, value, key, color }) => (
          <Card
            key={key}
            className={cn(
              "cursor-pointer transition-all",
              filter === key && "border-primary ring-1 ring-primary"
            )}
            onClick={() => setFilter(key as Verdict)}
          >
            <CardContent className="py-3 px-4">
              <p className={cn("text-2xl font-bold", color)}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 过滤栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="size-4 text-muted-foreground shrink-0" />
        {/* failTags 标签筛选 */}
        {allFailTags.length > 0 && (
          <Select value={tagFilter} onValueChange={(v) => v && setTagFilter(v)}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue placeholder="问题类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部问题</SelectItem>
              {allFailTags.map((tag) => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue placeholder="类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="image">首帧图像</SelectItem>
            <SelectItem value="video">视频</SelectItem>
            <SelectItem value="audio">音频</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {stats.fail > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={handleBatchRetry}
              disabled={batchRetrying}
            >
              {batchRetrying ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCcw className="size-3.5 mr-1" />
              )}
              批量重做失败项 ({stats.fail})
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchQAItems}
            className="h-8"
          >
            <RefreshCcw className="size-3.5 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      <Separator />

      {/* QA 列表 */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {items.length === 0 ? "暂无 QA 数据，请先生成内容" : "当前筛选条件下无结果"}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const verdictInfo = verdictConfig[item.review.verdict as keyof typeof verdictConfig] ?? verdictConfig.pass;
            const VerdictIcon = verdictInfo.icon;
            const failTags: { code: string; label: string }[] = (() => {
              try { return JSON.parse(item.review.failTags || "[]"); } catch { return []; }
            })();

            return (
              <Card
                key={item.take.id}
                className={cn(
                  "overflow-hidden",
                  item.review.verdict === "fail" && "border-destructive/40"
                )}
              >
                <CardContent className="p-0">
                  <div className="flex gap-4 p-4">
                    {/* 预览 */}
                    <div className="relative size-20 rounded-lg bg-muted shrink-0 overflow-hidden">
                      {item.take.localImage ? (
                        <Image
                          src={item.take.localImage}
                          alt="Take"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <ImageIcon className="size-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">
                          SC{item.sceneOrder.toString().padStart(2, "0")} · SH{item.shotOrder.toString().padStart(2, "0")}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {item.take.takeType}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {item.take.provider}
                        </Badge>
                        <div className={cn("flex items-center gap-1 text-xs", verdictInfo.color)}>
                          <VerdictIcon className="size-3.5" />
                          {verdictInfo.label}
                        </div>
                        {item.take.isAdopted && (
                          <Badge className="text-[10px] px-1.5 py-0">已采用</Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">{item.location}</p>

                      {item.review.details && (
                        <p className="text-xs text-muted-foreground">{item.review.details}</p>
                      )}

                      {failTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {failTags.map((tag, i) => (
                            <Badge
                              key={i}
                              variant="destructive"
                              className="text-[10px] px-1.5 py-0 opacity-80"
                            >
                              {tag.label}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>建议：</span>
                        <span className={cn(
                          item.review.suggestion === "must-redo" || item.review.suggestion === "change-provider"
                            ? "text-destructive"
                            : "text-foreground"
                        )}>
                          {suggestionLabels[item.review.suggestion] ?? item.review.suggestion}
                        </span>
                        <span>· 自动评分 {(item.review.score * 10).toFixed(1)}</span>
                      </div>
                    </div>

                    {/* 操作 */}
                    <div className="flex flex-col gap-1.5 shrink-0 justify-center">
                      {(item.review.suggestion === "must-redo" || item.review.suggestion === "change-provider") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleRetry(item)}
                          disabled={retrying.has(item.take.id)}
                        >
                          {retrying.has(item.take.id) ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3" />
                          )}
                          重做
                        </Button>
                      )}
                      {item.review.verdict === "fail" && item.review.suggestion !== "must-redo" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-amber-500 hover:text-amber-500"
                          onClick={() => handleAcceptMinor(item)}
                        >
                          <CheckCircle2 className="size-3 mr-1" />
                          接受瑕疵
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
