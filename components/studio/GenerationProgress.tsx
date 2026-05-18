"use client";

import React, { useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useGenerationStore } from "@/stores/generationStore";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";

interface GenerationProgressProps {
  taskId: string;
  label?: string;
  onComplete?: (result?: string) => void;
  onError?: () => void;
}

export function GenerationProgress({
  taskId,
  label,
  onComplete,
  onError,
}: GenerationProgressProps) {
  const { tasks, updateTask } = useGenerationStore();
  const task = tasks[taskId];
  const esRef = useRef<EventSource | null>(null);
  // 用 ref 缓存最新回调，避免每次回调引用变化都重建 SSE 连接
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  // 在 effect 中更新 ref，避免在渲染期间写 ref.current
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (esRef.current) esRef.current.close();

    const es = new EventSource(`/api/task/status?taskId=${taskId}`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        taskId: string;
        status: string;
        progress: number;
        result?: string;
        message?: string;
      };

      updateTask(taskId, {
        taskStatus: data.status as "pending" | "processing" | "completed" | "failed",
        progress: data.progress,
        result: data.result,
        message: data.message,
      });

      if (data.status === "completed") {
        onCompleteRef.current?.(data.result);
        es.close();
      }
      if (data.status === "failed") {
        onErrorRef.current?.();
        es.close();
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [taskId, updateTask]);

  if (!task) return null;

  const statusIconMap: Record<string, React.ReactNode> = {
    pending: <Clock className="size-3.5 text-muted-foreground" />,
    processing: <Loader2 className="size-3.5 text-primary animate-spin" />,
    completed: <CheckCircle2 className="size-3.5 text-green-500" />,
    failed: <XCircle className="size-3.5 text-destructive" />,
  };
  const statusIcon = statusIconMap[task.taskStatus] ?? statusIconMap.pending;

  const statusColorMap: Record<string, "default" | "secondary" | "destructive"> = {
    pending: "secondary",
    processing: "default",
    completed: "secondary",
    failed: "destructive",
  };
  const statusColor = statusColorMap[task.taskStatus] ?? "secondary";

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          {statusIcon}
          <span className="text-muted-foreground">{label ?? taskId.slice(0, 8)}</span>
        </div>
        <Badge variant={statusColor} className="text-[10px] px-1.5 py-0">
          {task.progress}%
        </Badge>
      </div>
      <Progress
        value={task.progress}
        className={cn(
          "h-1.5",
          task.taskStatus === "completed" && "[&>div]:bg-green-500",
          task.taskStatus === "failed" && "[&>div]:bg-destructive"
        )}
      />
      {task.message && (
        <p className="text-[10px] text-muted-foreground">{task.message}</p>
      )}
    </div>
  );
}
