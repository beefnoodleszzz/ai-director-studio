"use client";

import { MANGA_TEMPLATES } from "@/lib/manga/templates";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export function MangaTemplateSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {MANGA_TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50",
            value === t.id ? "border-primary bg-primary/5" : "border-border"
          )}
        >
          {/* 格子预览 SVG */}
          <div className="relative w-full aspect-[9/16] bg-muted rounded mb-2 overflow-hidden">
            <svg
              viewBox="0 0 9 16"
              className="w-full h-full"
              xmlns="http://www.w3.org/2000/svg"
            >
              {t.cells.map((cell, i) => (
                <rect
                  key={i}
                  x={cell.x * 9 + 0.1}
                  y={cell.y * 16 + 0.1}
                  width={cell.w * 9 - 0.2}
                  height={cell.h * 16 - 0.2}
                  rx="0.2"
                  fill={cell.emphasis ? "#6366f1" : "#94a3b8"}
                  fillOpacity={cell.emphasis ? "0.4" : "0.2"}
                  stroke={value === t.id ? "#6366f1" : "#64748b"}
                  strokeWidth="0.2"
                />
              ))}
            </svg>
          </div>
          <p className="text-xs font-medium truncate">{t.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{t.description}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t.shotsPerPage} 镜/页
          </p>
        </button>
      ))}
    </div>
  );
}
