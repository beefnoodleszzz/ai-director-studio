"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormActionBarProps {
  children: ReactNode;
  className?: string;
}

export function FormActionBar({ children, className }: FormActionBarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border/50 px-6 pb-6 pt-4",
        className
      )}
    >
      {children}
    </div>
  );
}
