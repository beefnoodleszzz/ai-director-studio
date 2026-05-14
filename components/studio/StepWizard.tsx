"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export const STEPS = [
  { id: 0, label: "世界观 & 角色" },
  { id: 1, label: "剧本拆解" },
  { id: 2, label: "首帧抽卡" },
  { id: 3, label: "视频 & 配音" },
  { id: 4, label: "时间线合成" },
  { id: 5, label: "续集传承" },
] as const;

interface StepWizardProps {
  activeStep: number;
  completedSteps?: number[];
  onStepClick?: (step: number) => void;
}

export function StepWizard({
  activeStep,
  completedSteps = [],
  onStepClick,
}: StepWizardProps) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STEPS.map((step, idx) => {
        const isActive = step.id === activeStep;
        const isCompleted = completedSteps.includes(step.id);
        const isClickable = !!onStepClick;

        return (
          <div key={step.id} className="flex items-center">
            <button
              disabled={!isClickable}
              onClick={() => onStepClick?.(step.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                isActive && "bg-primary/15 text-primary border border-primary/30",
                isCompleted && !isActive && "text-green-500",
                !isActive && !isCompleted && "text-muted-foreground hover:text-foreground",
                isClickable && "cursor-pointer",
                !isClickable && "cursor-default"
              )}
            >
              <span
                className={cn(
                  "size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                  isActive && "bg-primary text-primary-foreground",
                  isCompleted && !isActive && "bg-green-500/20 text-green-500",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted && !isActive ? (
                  <CheckCircle2 className="size-3" />
                ) : (
                  step.id + 1
                )}
              </span>
              {step.label}
            </button>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 shrink-0 mx-1 transition-colors",
                  isCompleted ? "bg-green-500/40" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
