"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SceneData } from "@/stores/projectStore";
import {
  RefreshCw,
  Image as ImageIcon,
  Video,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Music,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

const STATUS_CONFIG = {
  pending: { color: "secondary" as const, label: "待生成", icon: null },
  generating: {
    color: "default" as const,
    label: "生成中",
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  image_done: { color: "secondary" as const, label: "图片完成", icon: null },
  video_done: { color: "secondary" as const, label: "视频完成", icon: null },
  completed: {
    color: "secondary" as const,
    label: "完成",
    icon: <CheckCircle2 className="size-3 text-green-500" />,
  },
  error: {
    color: "destructive" as const,
    label: "出错",
    icon: <AlertCircle className="size-3" />,
  },
} as const;

interface SceneCardProps {
  scene: SceneData & { localSfx?: string | null; qaStatus?: string; qaRetries?: number };
  index: number;
  onRegenerateImage?: (sceneId: string) => void;
  onRegenerateVideo?: (sceneId: string) => void;
  onPromptChange?: (sceneId: string, prompt: string) => void;
}

export function SceneCard({
  scene,
  index,
  onRegenerateImage,
  onRegenerateVideo,
  onPromptChange,
}: SceneCardProps) {
  const statusCfg =
    STATUS_CONFIG[scene.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const qaStatus = scene.qaStatus;
  const hasSfx = !!(scene as any).localSfx;

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video bg-muted">
        {scene.localImage ? (
          <Image
            src={scene.localImage}
            alt={`Scene ${index + 1}`}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : scene.status === "generating" ? (
          <Skeleton className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-8 opacity-30" />
            <span className="text-xs opacity-50">镜头 {index + 1}</span>
          </div>
        )}

        {/* 左上角：媒体资产标记 */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {scene.localVideo && (
            <Badge
              variant="secondary"
              className="text-[10px] gap-1 px-1.5 py-0.5 bg-background/80 backdrop-blur-sm"
            >
              <Video className="size-2.5" />视频
            </Badge>
          )}
          {scene.localAudio && (
            <Badge
              variant="secondary"
              className="text-[10px] gap-1 px-1.5 py-0.5 bg-background/80 backdrop-blur-sm"
            >
              <Volume2 className="size-2.5" />配音
            </Badge>
          )}
          {hasSfx && (
            <Badge
              variant="secondary"
              className="text-[10px] gap-1 px-1.5 py-0.5 bg-background/80 backdrop-blur-sm"
            >
              <Music className="size-2.5" />音效
            </Badge>
          )}
        </div>

        {/* 右上角：状态 + QA 质检 */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <Badge
            variant={statusCfg.color}
            className="text-[10px] gap-1 px-1.5 py-0.5 bg-background/80 backdrop-blur-sm"
          >
            {statusCfg.icon}
            {statusCfg.label}
          </Badge>

          {/* QA 质检状态 */}
          {qaStatus === "pass" && (
            <Badge
              variant="secondary"
              className="text-[10px] gap-1 px-1.5 py-0.5 bg-green-500/15 text-green-400 border-green-500/30"
            >
              <ShieldCheck className="size-2.5" />质检通过
            </Badge>
          )}
          {qaStatus === "qa_failed" && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] gap-1 px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border-amber-500/30 cursor-help"
                    >
                      <ShieldX className="size-2.5" />质检降级
                      {scene.qaRetries ? ` ×${scene.qaRetries}` : ""}
                    </Badge>
                  </span>
                }
              />
              <TooltipContent side="left" className="text-xs max-w-44">
                质检未通过（重试 {scene.qaRetries ?? 0} 次），已降级使用最后一次结果
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 悬浮操作：重生成 */}
        <div className="absolute bottom-2 left-2 right-2 flex justify-between opacity-0 hover:opacity-100 transition-opacity">
          {onRegenerateImage && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    variant="secondary"
                    className="size-7 bg-background/80 backdrop-blur-sm"
                    onClick={() => onRegenerateImage(scene.id)}
                  />
                }
              >
                <RefreshCw className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>重新生成首帧</TooltipContent>
            </Tooltip>
          )}
          {onRegenerateVideo && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    variant="secondary"
                    className="size-7 bg-background/80 backdrop-blur-sm ml-auto"
                    onClick={() => onRegenerateVideo(scene.id)}
                  />
                }
              >
                <RefreshCw className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>重新生成视频（含质检）</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <CardContent className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">镜头 {index + 1}</span>
          {scene.audioPrompt && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 max-w-32 truncate">
              {scene.audioPrompt}
            </Badge>
          )}
        </div>

        <Textarea
          value={scene.visualPrompt}
          onChange={(e) => onPromptChange?.(scene.id, e.target.value)}
          className="text-xs min-h-14 resize-none font-mono"
          placeholder="画面描述提示词..."
        />

        {scene.dialogue && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-2 italic line-clamp-2">
            "{scene.dialogue}"
          </p>
        )}
      </CardContent>
    </Card>
  );
}
