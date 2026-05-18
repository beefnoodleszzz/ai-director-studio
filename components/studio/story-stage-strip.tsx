"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StoryStageStripProps {
  currentStage: string;
  hasOutline: boolean;
  hasLead: boolean;
  hasScript: boolean;
}

const stages = [
  { key: "outline_ready", label: "大纲", hint: "确定故事方向", gate: "outline" },
  { key: "cast_locked", label: "角色", hint: "锁定主角与角色关系", gate: "cast" },
  { key: "script_ready", label: "剧本", hint: "生成并确认正文", gate: "script" },
  { key: "breakdown_ready", label: "拆解", hint: "送入场次与镜头生产", gate: "breakdown" },
] as const;

function getStatus(
  stageKey: (typeof stages)[number]["gate"],
  flags: { hasOutline: boolean; hasLead: boolean; hasScript: boolean }
) {
  if (stageKey === "outline") {
    return flags.hasOutline ? "done" : "current";
  }
  if (stageKey === "cast") {
    if (!flags.hasOutline) return "locked";
    return flags.hasLead ? "done" : "current";
  }
  if (stageKey === "script") {
    if (!flags.hasLead) return "locked";
    return flags.hasScript ? "done" : "current";
  }
  if (!flags.hasScript) return "locked";
  return "current";
}

const toneMap = {
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  current: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  locked: "border-border bg-muted/50 text-muted-foreground",
} as const;

export function StoryStageStrip({
  currentStage,
  hasOutline,
  hasLead,
  hasScript,
}: StoryStageStripProps) {
  const completedCount = [hasOutline, hasLead, hasScript, currentStage === "breakdown_ready" || currentStage === "production_ready"].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Story Progress</p>
          <p className="mt-1 text-sm font-medium">先锁世界观与人物关系，再把稳定输入交给下游生产链。</p>
        </div>
        <Badge variant="outline" className="border-sky-500/20 bg-sky-500/5 text-sky-700">
          {completedCount}/4 阶段已推进
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {stages.map((stage, index) => {
          const status = getStatus(stage.gate, { hasOutline, hasLead, hasScript });
          const isCurrentStage = currentStage === stage.key;

          return (
            <div
              key={stage.key}
              className={cn(
                "rounded-2xl border px-4 py-3 transition-colors",
                toneMap[status],
                isCurrentStage && "ring-1 ring-current/20"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.22em] opacity-70">Stage {index + 1}</p>
                  <p className="mt-1 font-medium">{stage.label}</p>
                </div>
                <Badge variant="outline" className="border-current/20 bg-transparent text-[10px]">
                  {status === "done" ? "已就绪" : status === "current" ? "当前重点" : "待解锁"}
                </Badge>
              </div>
              <p className="mt-2 text-sm opacity-80">{stage.hint}</p>
              <p className="mt-2 text-xs opacity-70">
                {status === "done"
                  ? "这一层的核心输入已经稳定，可继续向下一层推进。"
                  : status === "current"
                    ? "建议优先在这一层完成 AI 生成、人工修订和确认。"
                    : "上一层未锁定前，这里不应继续，避免下游内容漂移。"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
