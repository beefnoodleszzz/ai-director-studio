"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const isDark = mounted ? resolvedTheme !== "light" : true;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-2 rounded-full border-border/70 bg-background/70 px-3 text-[0.8rem] backdrop-blur"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
    >
      {isDark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      <span>{isDark ? "深色" : "浅色"}</span>
    </Button>
  );
}
