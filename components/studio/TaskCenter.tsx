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

type TaskStatus = "queued" | "running" | "retrying" | "paused" | "failed" | "completed" | "cancelled";

interface Task {
  id: string;
  taskType: string;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  logs: string;
  errorReason: string;
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

interface TaskRowProps {
  task: Task;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}

function TaskRow({ task, onCancel, onRetry }: TaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = statusConfig[task.status] ?? statusConfig.queued;
  const StatusIcon = statusInfo.icon;

  const logLines = task.logs ? task.logs.split("\n").filter(Boolean) : [];
  const isActive = task.status === "running" || task.status === "retrying";

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("flex items-center gap-1.5 text-xs shrink-0 w-24", statusInfo.color)}>
          <StatusIcon className={cn("size-3.5", isActive && "animate-spin")} />
          {statusInfo.label}
        </div>

        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {taskTypeLabels[task.taskType] ?? task.taskType}
        </Badge>

        <div className="flex-1 min-w-0">
          {task.errorReason ? (
            <p className="text-xs text-destructive truncate">{task.errorReason}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              尝试 {task.attempts}/{task.maxAttempts} 次
            </p>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground shrink-0">
          {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true, locale: zhCN })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(task.status === "queued" || task.status === "running") && (
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
          {logLines.length > 0 ? (
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground opacity-0" />
          )}
        </div>
      </div>

      {expanded && logLines.length > 0 && (
        <div className="border-t bg-muted/30 px-4 py-3">
          <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
            {logLines.slice(-20).join("\n")}
          </pre>
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

  const filteredTasks = statusFilter === "all" ? tasks : tasks.filter((t) => t.status === statusFilter);

  const activeCount = tasks.filter((t) => t.status === "running" || t.status === "queued").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold">{tasks.length}</p>
            <p className="text-xs text-muted-foreground">总任务</p>
          </CardContent>
        </Card>
        <Card className={cn(activeCount > 0 && "border-blue-500/40")}>
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-blue-500">{activeCount}</p>
            <p className="text-xs text-muted-foreground">活跃中</p>
          </CardContent>
        </Card>
        <Card className={cn(failedCount > 0 && "border-destructive/40")}>
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-destructive">{failedCount}</p>
            <p className="text-xs text-muted-foreground">失败</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-2xl font-bold text-green-500">
              {tasks.filter((t) => t.status === "completed").length}
            </p>
            <p className="text-xs text-muted-foreground">已完成</p>
          </CardContent>
        </Card>
      </div>

      {/* 队列状态 */}
      {queueStats && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
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
          <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={fetchTasks}>
            <RefreshCcw className="size-3 mr-1" />
            刷新
          </Button>
        </div>
      )}

      <Separator />

      {/* 状态筛选 */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "running", "queued", "failed", "completed", "cancelled"] as const).map((s) => (
          <Badge
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "全部" : statusConfig[s as TaskStatus]?.label ?? s}
          </Badge>
        ))}
      </div>

      {/* 任务列表 */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {tasks.length === 0 ? "暂无任务记录" : "当前筛选条件下无结果"}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <TaskRow key={task.id} task={task} onCancel={handleCancel} onRetry={handleRetry} />
          ))}
        </div>
      )}
    </div>
  );
}
