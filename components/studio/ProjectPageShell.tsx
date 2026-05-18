"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProjectPageShellProps {
  title: string;
  description?: string;
  backHref?: string;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  stickyHeader?: boolean;
}

export function ProjectPageShell({
  title,
  description,
  backHref,
  actions,
  children,
  contentClassName,
  stickyHeader = false,
}: ProjectPageShellProps) {
  return (
    <div className="app-page py-8 pb-16 md:py-10 md:pb-20">
      <div
        className={cn(
          "mb-8 flex flex-col gap-4 border-b border-border/50 pb-6 md:flex-row md:items-start md:justify-between",
          stickyHeader &&
            "sticky top-0 z-20 bg-background/92 px-1 pt-4 pb-5 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-2"
        )}
      >
        <div className="flex min-w-0 items-start gap-3 md:gap-4">
          {backHref ? (
            <Link href={backHref} className="shrink-0">
              <Button variant="ghost" size="icon" className="mt-0.5 size-9 rounded-xl">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
          ) : null}
          <div className="min-w-0">
            <h1 className="type-page">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-3xl text-[0.95rem] leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      <div className={cn("space-y-6 md:space-y-8", contentClassName)}>{children}</div>
    </div>
  );
}
