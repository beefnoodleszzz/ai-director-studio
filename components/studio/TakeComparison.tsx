"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Star,
  StarOff,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface TakeForComparison {
  id: string;
  takeType: string;
  provider: string;
  localImage: string | null;
  localVideo: string | null;
  autoScore: number;
  humanScore: number;
  isAdopted: boolean;
  isDiscarded: boolean;
  generatedAt: string;
  generationMs: number;
  reviews: Array<{
    verdict: string;
    score: number;
    failTags: string;
    suggestion: string;
    details: string;
  }>;
}

interface Props {
  shotId: string;
  takes: TakeForComparison[];
  onAdoptChanged?: (newAdoptedId: string) => void;
}

const VERDICT_CONFIG = {
  pass: { icon: CheckCircle2, color: "text-green-500", label: "通过" },
  warn: { icon: AlertTriangle, color: "text-amber-500", label: "可接受" },
  fail: { icon: XCircle, color: "text-destructive", label: "需重做" },
} as const;

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-destructive"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

export function TakeComparison({ shotId, takes, onAdoptChanged }: Props) {
  const [adopting, setAdopting] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [colLayout, setColLayout] = useState<2 | 3>(takes.length <= 2 ? 2 : 3);

  const imageTakes = takes.filter((t) => t.takeType === "image");
  const videoTakes = takes.filter((t) => t.takeType === "video");
  const displayTakes = videoTakes.length > 0 ? videoTakes : imageTakes;

  const handleAdopt = async (takeId: string) => {
    setAdopting(takeId);
    try {
      await axios.post(`/api/shots/${shotId}/adopt`, { takeId });
      onAdoptChanged?.(takeId);
      toast.success("已切换为采用版本");
    } catch {
      toast.error("切换失败");
    } finally {
      setAdopting(null);
    }
  };

  const lightboxTake = lightboxIdx !== null ? displayTakes[lightboxIdx] : null;

  return (
    <div className="space-y-4">
      {/* 布局切换 */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          候选对比 · {displayTakes.length} 个版本
        </p>
        <div className="flex gap-1">
          <Button
            variant={colLayout === 2 ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setColLayout(2)}
          >
            2列
          </Button>
          <Button
            variant={colLayout === 3 ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setColLayout(3)}
          >
            3列
          </Button>
        </div>
      </div>

      {displayTakes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">暂无候选</p>
      ) : (
        <div
          className={cn(
            "grid gap-3",
            colLayout === 2 ? "grid-cols-2" : "grid-cols-3"
          )}
        >
          {displayTakes.map((take, idx) => {
            const review = take.reviews[0];
            const verdict = review?.verdict as keyof typeof VERDICT_CONFIG | undefined;
            const VerdictIcon = verdict ? VERDICT_CONFIG[verdict]?.icon : null;
            const verdictColor = verdict ? VERDICT_CONFIG[verdict]?.color : "";
            const failTags: string[] = review?.failTags
              ? JSON.parse(review.failTags)
              : [];

            return (
              <Card
                key={take.id}
                className={cn(
                  "overflow-hidden transition-shadow",
                  take.isAdopted ? "ring-2 ring-primary" : "",
                  take.isDiscarded ? "opacity-40" : ""
                )}
              >
                {/* 媒体预览 */}
                <div className="relative aspect-video bg-muted group">
                  {take.localImage ? (
                    <Image
                      src={take.localImage}
                      alt={`Take ${idx + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
                      无预览
                    </div>
                  )}
                  {take.isAdopted && (
                    <div className="absolute top-1.5 left-1.5">
                      <Badge className="text-xs py-0 px-1.5">采用中</Badge>
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1.5 right-1.5 size-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setLightboxIdx(idx)}
                  >
                    <Maximize2 className="size-3" />
                  </Button>
                </div>

                <CardContent className="pt-2 pb-3 px-3 space-y-2">
                  {/* 评分和 verdict */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {VerdictIcon && (
                        <VerdictIcon className={cn("size-3.5", verdictColor)} />
                      )}
                      <span className={cn("text-xs font-medium", verdictColor)}>
                        {verdict ? VERDICT_CONFIG[verdict].label : "未评审"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {take.provider || "—"}
                    </span>
                  </div>

                  <ScoreBar score={take.autoScore} />

                  {/* 失败标签 */}
                  {failTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {failTags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="destructive"
                          className="text-[10px] py-0 px-1"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* 操作按钮 */}
                  <Button
                    size="sm"
                    variant={take.isAdopted ? "secondary" : "outline"}
                    className="w-full h-7 text-xs"
                    disabled={take.isAdopted || !!adopting || take.isDiscarded}
                    onClick={() => handleAdopt(take.id)}
                  >
                    {adopting === take.id ? (
                      "切换中…"
                    ) : take.isAdopted ? (
                      <>
                        <Star className="size-3 mr-1 fill-current" /> 当前采用
                      </>
                    ) : (
                      <>
                        <StarOff className="size-3 mr-1" /> 设为采用
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      <Dialog
        open={lightboxTake !== null}
        onOpenChange={(open) => !open && setLightboxIdx(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Take 预览 · {lightboxTake?.provider} ·{" "}
              {lightboxTake && Math.round(lightboxTake.autoScore * 100)}分
            </DialogTitle>
          </DialogHeader>
          {lightboxTake?.localImage && (
            <div className="relative aspect-video w-full rounded-lg overflow-hidden">
              <Image
                src={lightboxTake.localImage}
                alt="预览"
                fill
                className="object-contain"
                sizes="80vw"
              />
            </div>
          )}
          {lightboxTake?.localVideo && (
            <video
              src={lightboxTake.localVideo}
              controls
              className="w-full rounded-lg"
            />
          )}

          {/* Lightbox 导航 */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={lightboxIdx === 0}
              onClick={() => setLightboxIdx((i) => (i !== null ? i - 1 : 0))}
            >
              <ChevronLeft className="size-4 mr-1" /> 上一个
            </Button>
            <span className="text-sm text-muted-foreground">
              {lightboxIdx !== null ? lightboxIdx + 1 : 0} / {displayTakes.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={lightboxIdx === displayTakes.length - 1}
              onClick={() =>
                setLightboxIdx((i) =>
                  i !== null ? Math.min(i + 1, displayTakes.length - 1) : 0
                )
              }
            >
              下一个 <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
