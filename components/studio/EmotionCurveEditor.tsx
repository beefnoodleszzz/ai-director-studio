"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, Save } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

interface SceneSummary {
  id: string;
  sceneOrder: number;
  location: string;
  emotionArc: string;
}

interface Props {
  projectId: string;
  episodeId: string;
  scenes: SceneSummary[];
  onUpdated?: (sceneId: string, emotionArc: string, intensity: number) => void;
}

// 情绪弧预设
const EMOTION_PRESETS = [
  { label: "平静", value: "calm", intensity: 2, color: "bg-blue-200" },
  { label: "铺垫", value: "setup", intensity: 3, color: "bg-sky-300" },
  { label: "升温", value: "rising", intensity: 5, color: "bg-amber-300" },
  { label: "紧张", value: "tension", intensity: 7, color: "bg-orange-400" },
  { label: "高潮", value: "climax", intensity: 9, color: "bg-red-500" },
  { label: "爆发", value: "peak", intensity: 10, color: "bg-red-600" },
  { label: "转折", value: "twist", intensity: 8, color: "bg-purple-500" },
  { label: "释怀", value: "relief", intensity: 4, color: "bg-green-400" },
  { label: "收尾", value: "ending", intensity: 2, color: "bg-slate-300" },
];

function parseIntensity(scene: SceneSummary): number {
  const match = scene.emotionArc?.match(/^(\d+)/) || 
    (scene as { plotPurpose?: string }).plotPurpose?.match?.(/intensity:(\d+)/);
  return match ? Math.min(10, parseInt(match[1])) : 3;
}

function parseArcLabel(emotionArc: string): string {
  const preset = EMOTION_PRESETS.find((p) => p.value === emotionArc);
  return preset?.label ?? emotionArc ?? "—";
}

export function EmotionCurveEditor({ projectId, episodeId, scenes, onUpdated }: Props) {
  const [localScenes, setLocalScenes] = useState(scenes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const handleSetEmotion = async (sceneId: string, arc: string, intensity: number) => {
    setSaving(sceneId);
    try {
      const scIdx = localScenes.findIndex((s) => s.id === sceneId);
      if (scIdx === -1) return;

      await axios.patch(
        `/api/projects/${projectId}/episodes/${episodeId}/scenes/${sceneId}/emotion`,
        { emotionArc: arc, emotionIntensity: intensity }
      );

      const updated = localScenes.map((s) =>
        s.id === sceneId ? { ...s, emotionArc: arc } : s
      );
      setLocalScenes(updated);
      setEditingId(null);
      onUpdated?.(sceneId, arc, intensity);
      toast.success("情绪弧已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(null);
    }
  };

  // 提取各场次情绪强度，用于绘制曲线
  const intensities = localScenes.map((s) => parseIntensity(s));
  const maxIntensity = Math.max(10, ...intensities);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">情绪曲线</p>
        <Badge variant="outline" className="text-xs">{localScenes.length} 场</Badge>
      </div>

      {/* SVG 曲线图 */}
      {localScenes.length > 1 && (
        <div className="relative h-24 bg-muted/30 rounded-lg overflow-hidden px-4 py-2">
          <svg
            viewBox={`0 0 ${localScenes.length * 40} ${maxIntensity * 8}`}
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* 曲线 */}
            <polyline
              points={localScenes.map((s, i) => {
                const x = i * 40 + 20;
                const y = (maxIntensity - parseIntensity(s)) * 8;
                return `${x},${y}`;
              }).join(" ")}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* 节点 */}
            {localScenes.map((s, i) => {
              const x = i * 40 + 20;
              const y = (maxIntensity - parseIntensity(s)) * 8;
              const preset = EMOTION_PRESETS.find((p) => p.value === s.emotionArc);
              return (
                <circle
                  key={s.id}
                  cx={x}
                  cy={y}
                  r="4"
                  fill={preset ? "#6366f1" : "#94a3b8"}
                  stroke="white"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>
        </div>
      )}

      {/* 场次列表 */}
      <div className="space-y-1.5">
        {localScenes.map((scene) => {
          const intensity = parseIntensity(scene);
          const preset = EMOTION_PRESETS.find((p) => p.value === scene.emotionArc);
          const isEditing = editingId === scene.id;

          return (
            <div key={scene.id} className="space-y-1">
              <div
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/30 cursor-pointer"
                onClick={() => setEditingId(isEditing ? null : scene.id)}
              >
                <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">
                  SC{scene.sceneOrder.toString().padStart(2, "0")}
                </span>

                {/* 情绪条 */}
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", preset?.color ?? "bg-slate-300")}
                    style={{ width: `${(intensity / 10) * 100}%` }}
                  />
                </div>

                <Badge
                  variant="outline"
                  className="text-[10px] w-14 text-center shrink-0"
                >
                  {parseArcLabel(scene.emotionArc)}
                </Badge>
                <span className="text-xs text-muted-foreground w-4 shrink-0">{intensity}</span>
              </div>

              {/* 快捷选择 */}
              {isEditing && (
                <div className="ml-12 flex flex-wrap gap-1.5 pb-2">
                  {EMOTION_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      disabled={saving === scene.id}
                      onClick={() => handleSetEmotion(scene.id, preset.value, preset.intensity)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all hover:border-primary",
                        scene.emotionArc === preset.value
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      )}
                    >
                      <span className={cn("size-2 rounded-full", preset.color)} />
                      {preset.label}
                      <span className="text-muted-foreground">({preset.intensity})</span>
                    </button>
                  ))}
                  {saving === scene.id && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Save className="size-3 animate-pulse" /> 保存中…
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
