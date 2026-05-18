"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
  variant?: "page" | "inline";
  tone?: "neutral" | "warning";
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  variant = "page",
  tone = "neutral",
  className,
}: EmptyStateProps) {
  const pageVariant = variant === "page";
  const warningTone = tone === "warning";

  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed text-center",
        pageVariant ? "px-6 py-14" : "px-4 py-10",
        warningTone ? "border-amber-500/25 bg-amber-500/5" : "border-border/70 bg-muted/10",
        className
      )}
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl border",
            pageVariant ? "size-16" : "size-14",
            warningTone
              ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
              : "border-border bg-muted/50 text-muted-foreground"
          )}
        >
          <Icon className={pageVariant ? "size-8" : "size-7"} />
        </div>
        <div className="space-y-1.5">
          <p className="type-body-strong">{title}</p>
          <p className="type-meta leading-6 text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}
