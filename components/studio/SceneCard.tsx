"use client";

/**
 * @deprecated 使用 ShotWorkbench 替代
 * 保留以便旧代码引用不报错
 */
import { Card, CardContent } from "@/components/ui/card";

interface LegacySceneData {
  id: string;
  sceneOrder: number;
  visualPrompt: string;
  dialogue: string;
  audioPrompt: string;
  localImage?: string | null;
  localVideo?: string | null;
  localAudio?: string | null;
  status: string;
}

interface SceneCardProps {
  scene: LegacySceneData;
  index: number;
}

export function SceneCard({ scene, index }: SceneCardProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">镜头 {index + 1}</p>
        <p className="text-xs mt-1 font-mono">{scene.visualPrompt}</p>
      </CardContent>
    </Card>
  );
}
