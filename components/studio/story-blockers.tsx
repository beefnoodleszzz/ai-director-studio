"use client";

import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BlockerItem {
  title: string;
  detail: string;
}

interface StoryBlockersProps {
  blockers: BlockerItem[];
  nextActionLabel: string;
  nextActionTarget: string;
  hasOutline: boolean;
  hasLead: boolean;
  hasScript: boolean;
  scriptPassed?: boolean;
}

export function StoryBlockers({
  blockers,
  nextActionLabel,
  nextActionTarget,
  hasOutline,
  hasLead,
  hasScript,
  scriptPassed = false,
}: StoryBlockersProps) {
  const healthy = blockers.length === 0;
  const readiness = [
    { label: "剧情大纲", ready: hasOutline },
    { label: "主角锁定", ready: hasLead },
    { label: "剧本确认稿", ready: hasScript },
    { label: "拆解前预检", ready: scriptPassed },
  ];

  return (
    <Card className={healthy ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {healthy ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-4 text-amber-600" />
          )}
          {healthy ? "当前没有阻断项" : "继续之前需要先处理这些阻断"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          {readiness.map((item) => (
            <div key={item.label} className="rounded-xl border bg-background/75 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-sm font-medium">{item.ready ? "已具备" : "待补齐"}</p>
            </div>
          ))}
        </div>

        {healthy ? (
          <p className="text-sm text-muted-foreground">
            当前上游内容已经具备进入下一阶段的基础条件。建议继续执行推荐动作，把故事输入锁在这里，不要把核心叙事决策分散到下游执行页。
          </p>
        ) : (
          <div className="space-y-3">
            {blockers.map((blocker) => (
              <div key={blocker.title} className="rounded-xl border border-amber-500/20 bg-background/80 px-4 py-3">
                <p className="font-medium text-sm">{blocker.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{blocker.detail}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/80 px-4 py-3">
          <div>
            <p className="text-sm font-medium">推荐下一步</p>
            <p className="text-sm text-muted-foreground">{nextActionLabel}</p>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => document.getElementById(nextActionTarget)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            前往处理
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
