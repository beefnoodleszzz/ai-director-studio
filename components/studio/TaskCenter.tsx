"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  RefreshCcw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { type BlockMeta } from "@/lib/studio-contracts";

type TaskStatus = "queued" | "running" | "retrying" | "paused" | "failed" | "completed" | "cancelled";

interface Task {
  id: string;
  taskType: string;
  status: TaskStatus;
  taskStage?: string;
  attempts: number;
  maxAttempts: number;
  logs: string;
  errorReason: string;
  blockReason?: string;
  blockMeta?: BlockMeta | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  inputRef: string;
  outputRef: string;
}

interface QueueStats {
  size: number;
  pending: number;
  concurrency: number;
}

const statusConfig: Record<TaskStatus, { label: string; icon: React.ElementType; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "等待中", icon: Clock, color: "text-muted-foreground", badgeVariant: "outline" },
  running: { label: "运行中", icon: Loader2, color: "text-blue-500", badgeVariant: "secondary" },
  retrying: { label: "重试中", icon: RefreshCcw, color: "text-amber-500", badgeVariant: "secondary" },
  paused: { label: "已暂停", icon: Pause, color: "text-muted-foreground", badgeVariant: "outline" },
  failed: { label: "失败", icon: AlertTriangle, color: "text-destructive", badgeVariant: "destructive" },
  completed: { label: "已完成", icon: CheckCircle2, color: "text-green-500", badgeVariant: "default" },
  cancelled: { label: "已取消", icon: XCircle, color: "text-muted-foreground", badgeVariant: "outline" },
};

const taskTypeLabels: Record<string, string> = {
  "script-breakdown": "剧本拆解",
  image: "首帧生成",
  video: "视频生成",
  audio: "配音生成",
  sfx: "音效生成",
  bgm: "BGM 生成",
  assembly: "合成成片",
  qa: "质量检测",
};

const blockReasonLabels: Record<string, string> = {
  "missing-character-assets": "角色资产不完整",
  "image-qa-failed": "首帧质检未通过",
  "video-qa-failed": "视频质检未通过",
  "audio-qa-failed": "音频质检未通过",
  "continuity-check-failed": "连续性质检未通过",
  "manual-review-required": "需要人工确认",
};

interface TaskRowProps {
  task: Task;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string, deleteOutput?: boolean) => void;
}

function TaskRow({ task, onCancel, onRetry, onDelete }: TaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = statusConfig[task.status] ?? statusConfig.queued;
  const StatusIcon = statusInfo.icon;

  const logLines = task.logs ? task.logs.split("\n").filter(Boolean) : [];
  const isActive = task.status === "running" || task.status === "retrying";
  const isBlocked = Boolean(task.blockMeta || task.blockReason);
  const blockLabel =
    task.blockMeta?.message ||
    (task.blockReason ? blockReasonLabels[task.blockReason] ?? task.blockReason : null);
  let outputRef: { publicUrl?: string; url?: string; outputUrl?: string; outputType?: string } | null = null;
  let inputRef: {
    shotId?: string;
    provider?: string;
    adoptedImageTakeId?: string;
    episodeId?: string;
    retryStrategy?: {
      promptHints?: string[];
      preferredAssetTypes?: string[];
      disableContinuityReference?: boolean;
    };
  } | null = null;
  try {
    outputRef = task.outputRef ? JSON.parse(task.outputRef) : null;
  } catch {
    outputRef = null;
  }
  try {
    inputRef = task.inputRef ? JSON.parse(task.inputRef) : null;
  } catch {
    inputRef = null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60">
      <div
        className="grid cursor-pointer gap-3 px-4 py-4 transition-colors hover:bg-muted/20 xl:grid-cols-[9rem_8rem_minmax(0,1fr)_8rem_auto]"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("flex items-center gap-1.5 text-sm", statusInfo.color)}>
          <StatusIcon className={cn("size-3.5", isActive && "animate-spin")} />
          {statusInfo.label}
        </div>

        <Badge variant="outline" className="w-fit text-xs px-1.5 py-0">
          {taskTypeLabels[task.taskType] ?? task.taskType}
        </Badge>

        <div className="min-w-0">
          {isBlocked ? (
            <div className="space-y-0.5">
              <p className="text-sm text-amber-700 truncate">{blockLabel ?? "任务已阻断"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {task.blockMeta?.stage ? `阶段：${task.blockMeta.stage}` : task.taskStage ? `阶段：${task.taskStage}` : "等待人工处理"}
              </p>
            </div>
          ) : task.errorReason ? (
            <p className="text-sm text-destructive truncate">{task.errorReason}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              尝试 {task.attempts}/{task.maxAttempts} 次
            </p>
          )}
        </div>

        <div className="text-xs text-muted-foreground xl:text-right">
          {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true, locale: zhCN })}
        </div>

        <div className="flex items-center gap-1 xl:justify-end">
          {(task.status === "queued" || task.status === "running") && !isBlocked && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={(e) => { e.stopPropagation(); onCancel(task.id); }}
            >
              <XCircle className="size-3.5 text-muted-foreground" />
            </Button>
          )}
          {task.status === "failed" && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={(e) => { e.stopPropagation(); onRetry(task.id); }}
            >
              <RefreshCcw className="size-3.5" />
            </Button>
          )}
          {(task.status === "failed" || task.status === "cancelled" || task.status === "completed") && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id, task.status === "completed");
              }}
            >
              <XCircle className="size-3.5 text-destructive" />
            </Button>
          )}
          {logLines.length > 0 ? (
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground opacity-0" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="grid gap-3 border-t bg-muted/30 px-4 py-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          {outputRef?.publicUrl || outputRef?.url || outputRef?.outputUrl ? (
            <div className="rounded-xl border bg-background p-3">
              <p className="mb-2 text-xs text-muted-foreground">任务结果预览</p>
              <MediaPreview
                type={outputRef?.outputType === "audio" ? "audio" : outputRef?.outputType === "image" ? "image" : "video"}
                src={outputRef?.publicUrl ?? outputRef?.url ?? outputRef?.outputUrl}
                className={outputRef?.outputType === "audio" ? "" : "aspect-video"}
              />
            </div>
          ) : (
            <div className="hidden xl:block" />
          )}
          <div className="space-y-3">
            {(isBlocked || inputRef) && (
              <div className="rounded-xl border bg-background p-3">
                <p className="mb-2 text-xs text-muted-foreground">任务上下文</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {task.taskStage ? <p>阶段：{task.taskStage}</p> : null}
                  {inputRef?.shotId ? <p>镜头：{inputRef.shotId}</p> : null}
                  {inputRef?.provider ? <p>Provider：{inputRef.provider}</p> : null}
                  {blockLabel ? <p className="text-amber-700">阻断：{blockLabel}</p> : null}
                  {task.blockMeta?.details?.length ? <p>{task.blockMeta.details.slice(0, 2).join(" / ")}</p> : null}
                  {inputRef?.retryStrategy?.promptHints?.length ? (
                    <p>重试策略：{inputRef.retryStrategy.promptHints.slice(0, 2).join(" / ")}</p>
                  ) : null}
                </div>
              </div>
            )}
            {logLines.length > 0 ? (
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                {logLines.slice(-20).join("\n")}
              </pre>
            ) : (
              <div className="rounded-xl border bg-background p-3 text-xs text-muted-foreground">
                暂无日志
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  projectId: string;
  autoRefresh?: boolean;
}

export function TaskCenter({ projectId, autoRefresh = true }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [tick, setTick] = useState(0);

  const fetchTasks = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axios.get<{ tasks: Task[]; queueStats: QueueStats }>(
          `/api/task/status?projectId=${projectId}`
        );
        if (!cancelled) {
          setTasks(res.data.tasks);
          setQueueStats(res.data.queueStats);
        }
      } catch {
        // 静默失败
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectId, tick]);

  useEffect(() => {
    if (!autoRefresh) return;
    const hasActive = tasks.some((t) => t.status === "running" || t.status === "queued" || t.status === "retrying");
    if (!hasActive) return;
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, tasks]);

  const handleCancel = async (taskId: string) => {
    try {
      await axios.delete(`/api/task/status?taskId=${taskId}`);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: "cancelled" as TaskStatus } : t)));
      toast.success("任务已取消");
    } catch {
      toast.error("取消失败");
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await axios.post("/api/task/retry", { taskId });
      toast.success("已重新入队，请稍候");
      fetchTasks();
    } catch {
      toast.error("重试失败，请在镜头工作台手动操作");
    }
  };

  const handleDelete = async (taskId: string, deleteOutput = false) => {
    try {
      const qs = new URLSearchParams({
        taskId,
        hardDelete: "true",
        deleteOutput: deleteOutput ? "true" : "false",
      });
      await axios.delete(`/api/task/status?${qs.toString()}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success("任务记录已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const filteredTasks = statusFilter === "all" ? tasks : tasks.filter((t) => t.status === statusFilter);

  const blockedCount = tasks.filter((t) => t.blockMeta || t.blockReason).length;
  const activeCount = tasks.filter((t) => (t.status === "running" || t.status === "queued") && !t.blockMeta && !t.blockReason).length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;

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
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold">{tasks.length}</p>
            <p className="text-sm text-muted-foreground">总任务</p>
          </CardContent>
        </Card>
        <Card className={cn(activeCount > 0 && "border-blue-500/40")}>
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-blue-500">{activeCount}</p>
            <p className="text-sm text-muted-foreground">活跃中</p>
          </CardContent>
        </Card>
        <Card className={cn(failedCount > 0 && "border-destructive/40")}>
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-destructive">{failedCount}</p>
            <p className="text-sm text-muted-foreground">失败</p>
          </CardContent>
        </Card>
        <Card className={cn(blockedCount > 0 && "border-amber-500/40")}>
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-amber-600">{blockedCount}</p>
            <p className="text-sm text-muted-foreground">待复核</p>
          </CardContent>
        </Card>
      </div>

      {/* 队列状态 */}
      {queueStats && (
        <div className="flex min-w-0 flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Play className="size-3" />
            <span>并发数: {queueStats.concurrency}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3" />
            <span>队列: {queueStats.size}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Loader2 className="size-3" />
            <span>运行: {queueStats.pending}</span>
          </div>
          {blockedCount > 0 && (
            <div className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="size-3" />
              <span>阻断: {blockedCount}</span>
            </div>
          )}
          <Button size="sm" variant="ghost" className="ml-auto h-8 text-sm" onClick={fetchTasks}>
            <RefreshCcw className="size-3 mr-1" />
            刷新
          </Button>
        </div>
      )}

      <Separator />

      {/* 状态筛选 */}
      <div className="flex flex-wrap gap-2">
        {(["all", "running", "queued", "failed", "completed", "cancelled"] as const).map((s) => (
          <Badge
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            className="cursor-pointer px-2 py-1 text-sm"
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "全部" : statusConfig[s as TaskStatus]?.label ?? s}
          </Badge>
        ))}
      </div>

      {/* 任务列表 */}
      {blockedCount > 0 && statusFilter === "all" && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          当前有 {blockedCount} 个任务等待人工复核。展开任务可查看阻断阶段、原因和上下文。
        </div>
      )}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-base">
          {tasks.length === 0 ? "暂无任务记录" : "当前筛选条件下无结果"}
        </div>
      ) : (
        <div className="min-w-0 space-y-3">
          {filteredTasks.map((task) => (
            <TaskRow key={task.id} task={task} onCancel={handleCancel} onRetry={handleRetry} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
