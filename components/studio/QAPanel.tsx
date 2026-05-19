"use client";

import { useEffect, useState } from "react";
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
import { pollTaskUntilSettled } from "@/lib/task-client";
import { cn } from "@/lib/utils";
import { MediaPreview } from "@/components/studio/MediaPreview";

type Verdict = "pass" | "warn" | "fail" | "all";

interface QAItem {
  // 路由上下文
  projectId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  adoptedImageTakeId: string | null;
  adoptedVideoTakeId?: string | null;
  visualPrompt: string;
  audioPrompt: string;
  dialogue: string;
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
    paramsSnapshot?: {
      retryStrategy?: {
        promptHints?: string[];
        preferredAssetTypes?: string[];
        disableContinuityReference?: boolean;
      };
    } | null;
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

const QA_TYPE_LABELS: Record<string, string> = {
  all: "全部类型",
  image: "首帧图像",
  video: "视频",
  audio: "音频",
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
      let taskId = "";
      if (item.take.takeType === "image") {
        const res = await axios.post<{ taskId: string }>("/api/generate/image", {
          projectId: item.projectId,
          episodeId: item.episodeId,
          sceneId: item.sceneId,
          shotId: item.shotId,
          provider: item.take.provider,
          candidateCount: 1,
        });
        taskId = res.data.taskId;
      } else if (item.take.takeType === "video") {
        if (!item.adoptedImageTakeId) {
          toast.error("该镜头没有已采用的图片 take，无法生成视频");
          return;
        }
        const res = await axios.post<{ taskId: string }>("/api/generate/video", {
          projectId: item.projectId,
          episodeId: item.episodeId,
          sceneId: item.sceneId,
          shotId: item.shotId,
          adoptedImageTakeId: item.adoptedImageTakeId,
          visualPrompt: item.visualPrompt,
          provider: item.take.provider,
        });
        taskId = res.data.taskId;
      } else if (item.take.takeType === "audio") {
        const res = await axios.post<{ taskId: string }>("/api/generate/audio", {
          projectId: item.projectId,
          episodeId: item.episodeId,
          sceneId: item.sceneId,
          shotId: item.shotId,
          dialogue: item.dialogue,
          audioPrompt: item.audioPrompt,
          provider: item.take.provider,
        });
        taskId = res.data.taskId;
      }
      toast.success("已加入重新生成队列");
      fetchQAItems();
      if (taskId) {
        void pollTaskUntilSettled(taskId)
          .then(() => fetchQAItems())
          .catch(() => {
            // 静默失败，任务中心仍会展示最新状态
          });
      }
    } catch {
      toast.error("重新生成失败");
    } finally {
      setRetrying((prev) => { const next = new Set(prev); next.delete(item.take.id); return next; });
    }
  };

  const handleRetryWithGuidance = async (item: QAItem) => {
    setRetrying((prev) => new Set(prev).add(item.take.id));
    try {
      const failTags: { code: string; label: string }[] = (() => {
        try { return JSON.parse(item.review.failTags || "[]"); } catch { return []; }
      })();
      const guidance =
        item.take.paramsSnapshot?.retryStrategy?.promptHints?.join(", ") ||
        item.review.details ||
        "enhance continuity and identity consistency";
      await axios.post(`/api/shots/${item.shotId}/redo`, {
        strategyHint: guidance,
        reasonTags: failTags.map((tag) => tag.code),
      });
      toast.success("已按建议提交镜头重做");
      fetchQAItems();
    } catch {
      toast.error("按建议重做失败");
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
    <div className="min-w-0 space-y-6">
      {/* 统计卡片 */}
      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
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
              <p className="type-meta text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 过滤栏 */}
      <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-muted/15 p-3">
        <Filter className="size-4 text-muted-foreground shrink-0" />
        {/* failTags 标签筛选 */}
        {allFailTags.length > 0 && (
          <Select value={tagFilter} onValueChange={(v) => v && setTagFilter(v)}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue placeholder="问题类型">
                {tagFilter === "all" ? "全部问题" : tagFilter}
              </SelectValue>
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
            <SelectValue placeholder="类型">
              {QA_TYPE_LABELS[typeFilter] ?? typeFilter}
            </SelectValue>
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
        <div className="grid min-w-0 gap-4 xl:grid-cols-2 xl:items-start">
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
                  <div className="grid gap-4 p-4 xl:grid-cols-[14rem_minmax(0,1fr)_auto] xl:items-start">
                    {/* 预览 */}
                    <div className="overflow-hidden rounded-xl bg-muted xl:sticky xl:top-4">
                      {item.take.localImage || item.take.localVideo ? (
                        <MediaPreview
                          type={item.take.localVideo ? "video" : "image"}
                          src={item.take.localVideo ?? item.take.localImage}
                          poster={item.take.localImage}
                          className="aspect-[4/5] xl:aspect-[3/4]"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center">
                          <ImageIcon className="size-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="min-w-0 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono type-meta text-muted-foreground">
                          SC{item.sceneOrder.toString().padStart(2, "0")} · SH{item.shotOrder.toString().padStart(2, "0")}
                        </span>
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {item.take.takeType}
                        </Badge>
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {item.take.provider}
                        </Badge>
                        <div className={cn("flex items-center gap-1 text-sm", verdictInfo.color)}>
                          <VerdictIcon className="size-3.5" />
                          {verdictInfo.label}
                        </div>
                        {item.take.isAdopted && (
                          <Badge className="text-xs px-1.5 py-0">已采用</Badge>
                        )}
                        {item.take.takeType === "video" && item.adoptedImageTakeId && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            已绑定首帧
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm font-medium leading-6 text-foreground">{item.location}</p>

                      {item.review.details && (
                        <p className="text-sm leading-6 text-muted-foreground">{item.review.details}</p>
                      )}

                      {failTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {failTags.map((tag, i) => (
                            <Badge
                              key={i}
                              variant="destructive"
                              className="text-xs px-1.5 py-0 opacity-80"
                            >
                              {tag.label}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {item.take.paramsSnapshot?.retryStrategy?.promptHints?.length ? (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                          <p className="text-xs font-medium text-amber-700">系统下次重试会这样调整</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.take.paramsSnapshot.retryStrategy.promptHints.slice(0, 3).map((hint) => (
                              <Badge key={hint} variant="outline" className="text-[10px] border-amber-500/30 text-amber-700">
                                {hint}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="grid min-w-0 grid-cols-[auto_minmax(7rem,1fr)_auto] items-center gap-x-2 type-meta text-muted-foreground">
                        <span className="whitespace-nowrap">建议：</span>
                        <span
                          className={cn(
                            "whitespace-nowrap",
                            item.review.suggestion === "must-redo" || item.review.suggestion === "change-provider"
                              ? "text-destructive"
                              : "text-foreground"
                          )}
                        >
                          {suggestionLabels[item.review.suggestion] ?? item.review.suggestion}
                        </span>
                        <span className="justify-self-end whitespace-nowrap">自动评分 {(item.review.score * 10).toFixed(1)}</span>
                      </div>
                      {item.take.takeType === "video" && !item.adoptedImageTakeId ? (
                        <p className="text-xs text-amber-600">当前镜头没有已采用首帧，视频重做会被阻断。</p>
                      ) : null}
                    </div>

                    {/* 操作 */}
                    <div className="flex flex-row flex-wrap gap-2 xl:w-32 xl:flex-col xl:justify-start">
                      {(item.review.suggestion === "must-redo" || item.review.suggestion === "change-provider") && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1 text-sm"
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
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 text-sm text-amber-700"
                            onClick={() => handleRetryWithGuidance(item)}
                            disabled={retrying.has(item.take.id)}
                          >
                            按建议重做
                          </Button>
                        </>
                      )}
                      {item.review.verdict === "fail" && item.review.suggestion !== "must-redo" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 text-sm text-amber-500 hover:text-amber-500"
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
