"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GripVertical, CheckCircle2, XCircle, AlertTriangle, Clock, Film, Image as ImageIcon } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

interface ShotSummary {
  id: string;
  shotOrder: number;
  shotType: string;
  dramaticTag?: string | null;
  risk?: {
    isCritical: boolean;
    missingVideo: boolean;
    imageFallbackOnly: boolean;
    criticalNeedsVideo: boolean;
  };
  pipelineStage?: string | null;
  exportReadiness?: string | null;
  dialogue: string;
  takes: Array<{
    isAdopted: boolean;
    isDiscarded: boolean;
    takeType: string;
    reviews?: Array<{ verdict: string }>;
  }>;
}

interface Props {
  projectId: string;
  episodeId: string;
  sceneId: string;
  shots: ShotSummary[];
  onReordered?: (shots: ShotSummary[]) => void;
  onSelectShot?: (shotId: string) => void;
  activeShot?: string;
}

const SHOT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "text-muted-foreground" },
  image_generating: { label: "首帧生成中", color: "text-blue-500" },
  image_ready: { label: "首帧就绪", color: "text-sky-500" },
  video_generating: { label: "视频生成中", color: "text-blue-500" },
  video_ready: { label: "视频就绪", color: "text-green-500" },
  blocked_for_review: { label: "待人工处理", color: "text-destructive" },
  ready_for_export: { label: "可导出", color: "text-green-600" },
};

function getShotVerdict(shot: ShotSummary): "pass" | "warn" | "fail" | "none" {
  const adoptedTake = shot.takes.find((t) => t.isAdopted);
  if (!adoptedTake) return "none";
  const verdict = adoptedTake.reviews?.[0]?.verdict;
  if (!verdict) return "none";
  return verdict as "pass" | "warn" | "fail";
}

const VERDICT_ICON = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  none: Clock,
};
const VERDICT_COLOR = {
  pass: "text-green-500",
  warn: "text-amber-500",
  fail: "text-destructive",
  none: "text-muted-foreground",
};

export function ShotTimeline({
  projectId,
  episodeId,
  sceneId,
  shots: initialShots,
  onReordered,
  onSelectShot,
  activeShot,
}: Props) {
  const [shots, setShots] = useState(initialShots);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dragOverId = useRef<string | null>(null);

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverId.current = id;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingId || !dragOverId.current || draggingId === dragOverId.current) {
      setDraggingId(null);
      return;
    }

    const fromIdx = shots.findIndex((s) => s.id === draggingId);
    const toIdx = shots.findIndex((s) => s.id === dragOverId.current);
    if (fromIdx === -1 || toIdx === -1) { setDraggingId(null); return; }

    const newShots = [...shots];
    const [moved] = newShots.splice(fromIdx, 1);
    newShots.splice(toIdx, 0, moved);
    const reordered = newShots.map((s, i) => ({ ...s, shotOrder: i + 1 }));
    setShots(reordered);
    setDraggingId(null);

    // 持久化
    setSaving(true);
    try {
      await axios.post(
        `/api/projects/${projectId}/episodes/${episodeId}/scenes/${sceneId}/shots/reorder`,
        { shotIds: reordered.map((s) => s.id) }
      );
      onReordered?.(reordered);
    } catch {
      toast.error("排序保存失败");
      setShots(initialShots); // 回滚
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {shots.length} 个镜头 · 拖拽 <GripVertical className="size-3 inline" /> 调整顺序
        </p>
        {saving && <span className="text-xs text-muted-foreground">保存中…</span>}
      </div>

      {/* 时间线条 */}
      <div className="relative">
        {/* 连接线 */}
        <div className="absolute top-5 left-4 right-4 h-0.5 bg-border" />

        <div className="relative flex gap-2 overflow-x-auto pb-2">
          {shots.map((shot) => {
            const verdict = getShotVerdict(shot);
            const VIcon = VERDICT_ICON[verdict];
            const vColor = VERDICT_COLOR[verdict];
            const statusConf = SHOT_STATUS_CONFIG[shot.pipelineStage ?? "draft"] ?? SHOT_STATUS_CONFIG.draft;
            const isActive = shot.id === activeShot;

            const hasTake = shot.takes.some((t) => t.takeType === "image" && !t.isDiscarded);
            const hasVideo = shot.takes.some((t) => t.takeType === "video" && !t.isDiscarded);
            const needsCriticalVideo = shot.risk?.criticalNeedsVideo;

            return (
              <div
                key={shot.id}
                draggable
                onDragStart={() => handleDragStart(shot.id)}
                onDragOver={(e) => handleDragOver(e, shot.id)}
                onDrop={handleDrop}
                className={cn(
                  "flex-none cursor-pointer select-none",
                  draggingId === shot.id && "opacity-40"
                )}
                onClick={() => onSelectShot?.(shot.id)}
              >
                <div
                  className={cn(
                    "flex flex-col items-center gap-1 w-16 group",
                    isActive && "scale-105"
                  )}
                >
                  {/* 时间轴节点 */}
                  <div
                    className={cn(
                      "size-10 rounded-full flex items-center justify-center border-2 bg-background transition-all z-10",
                      isActive ? "border-primary" : "border-border",
                      "group-hover:border-primary/60"
                    )}
                  >
                    <VIcon className={cn("size-4", vColor)} />
                  </div>

                  {/* 标签 */}
                  <div className="text-center">
                    <p className="text-[10px] font-mono font-semibold">
                      {shot.shotOrder.toString().padStart(2, "0")}
                    </p>
                    <p className={cn("text-[9px]", statusConf.color)}>{statusConf.label}</p>
                    {shot.dramaticTag ? (
                      <p className="text-[9px] text-muted-foreground">{shot.dramaticTag}</p>
                    ) : null}
                  </div>

                  {/* 媒体类型徽章 */}
                  <div className="flex gap-0.5">
                    {hasTake && <ImageIcon className="size-2.5 text-sky-500" />}
                    {hasVideo && <Film className="size-2.5 text-green-500" />}
                    {needsCriticalVideo && <AlertTriangle className="size-2.5 text-amber-500" />}
                  </div>

                  {/* 拖拽把手 */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                    <GripVertical className="size-3 text-muted-foreground" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {[
          { Icon: CheckCircle2, color: "text-green-500", label: "已通过" },
          { Icon: AlertTriangle, color: "text-amber-500", label: "可接受" },
          { Icon: XCircle, color: "text-destructive", label: "需重做" },
          { Icon: Clock, color: "text-muted-foreground", label: "待审核" },
        ].map(({ Icon, color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <Icon className={cn("size-3", color)} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
