"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Wand2,
  Video,
  Volume2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ImageIcon,
  Loader2,
  Star,
  List,
  AlignJustify,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ShotTimeline } from "@/components/studio/ShotTimeline";

export interface TakeData {
  id: string;
  takeType: string;
  provider: string;
  localImage: string | null;
  localVideo: string | null;
  localAudio: string | null;
  autoScore: number;
  humanScore: number;
  isAdopted: boolean;
  isDiscarded: boolean;
  createdAt: string;
  reviews: {
    id: string;
    reviewType: string;
    verdict: string;
    score: number;
    suggestion: string;
    details: string;
  }[];
}

export interface ShotData {
  id: string;
  shotOrder: number;
  shotType: string;
  cameraAngle: string;
  cameraMotion: string;
  durationSecs: number;
  actionDesc: string;
  narrativePurpose: string;
  emotionGoal: string;
  visualPrompt: string;
  audioPrompt: string;
  dialogue: string;
  adoptedTakeId: string | null;
  status: string;
  readiness: string;
  takes: TakeData[];
}

interface TakeCardProps {
  take: TakeData;
  isAdopted: boolean;
  onAdopt: (takeId: string) => void;
  onDiscard: (takeId: string) => void;
}

function TakeCard({ take, isAdopted, onAdopt, onDiscard }: TakeCardProps) {
  const verdict = take.reviews?.[0]?.verdict ?? "pending";
  const verdictColor =
    verdict === "pass" ? "text-green-500" : verdict === "warn" ? "text-amber-500" : "text-destructive";

  return (
    <div
      className={cn(
        "relative rounded-lg border overflow-hidden transition-all",
        isAdopted ? "border-primary ring-1 ring-primary" : "border-border hover:border-border/80"
      )}
    >
      {/* 媒体预览 */}
      <div className="relative aspect-[9/16] bg-muted">
        {take.localImage ? (
          <Image
            src={take.localImage}
            alt="Take preview"
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <ImageIcon className="size-8" />
          </div>
        )}
        {take.localVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Video className="size-8 text-white" />
          </div>
        )}
        {isAdopted && (
          <div className="absolute top-2 left-2">
            <Badge className="text-[10px] px-1.5 py-0 bg-primary">已采用</Badge>
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0 bg-background/80", verdictColor)}
          >
            {verdict === "pass" ? "通过" : verdict === "warn" ? "可用" : verdict === "fail" ? "失败" : "待审"}
          </Badge>
        </div>
      </div>

      {/* 底部信息 */}
      <div className="p-2 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{take.provider || "unknown"}</span>
          <div className="flex items-center gap-0.5">
            <Star className="size-3 text-amber-400" />
            <span>{(take.autoScore * 10).toFixed(1)}</span>
          </div>
        </div>
        {take.reviews?.[0]?.details && (
          <p className="text-[10px] text-muted-foreground truncate">{take.reviews[0].details}</p>
        )}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={isAdopted ? "default" : "outline"}
            className="flex-1 h-6 text-[10px]"
            onClick={() => onAdopt(take.id)}
            disabled={isAdopted}
          >
            {isAdopted ? <CheckCircle2 className="size-3 mr-1" /> : null}
            {isAdopted ? "已采用" : "采用"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] text-muted-foreground"
            onClick={() => onDiscard(take.id)}
            disabled={take.isDiscarded}
          >
            <XCircle className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ShotCardProps {
  shot: ShotData;
  projectId: string;
  episodeId: string;
  sceneId: string;
  onUpdate: (shot: ShotData) => void;
}

function ShotCard({ shot, projectId, episodeId, sceneId, onUpdate }: ShotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [provider, setProvider] = useState("seedream");
  const [videoProvider, setVideoProvider] = useState("kling");
  const [compareOpen, setCompareOpen] = useState(false);
  const [recommendedProvider, setRecommendedProvider] = useState<string | null>(null);
  const [recommendReason, setRecommendReason] = useState<string>("");

  // 在组件挂载时获取推荐 Provider
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axios.get<{ provider: string; reason: string }>(
          `/api/projects/${projectId}/recommend-provider?takeType=image&fallback=seedream`
        );
        if (!cancelled) {
          setRecommendedProvider(res.data.provider);
          setRecommendReason(res.data.reason);
          setProvider(res.data.provider);
        }
      } catch {
        // 静默失败，使用默认值
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  const imageTakes = shot.takes.filter((t) => t.takeType === "image");
  const videoTakes = shot.takes.filter((t) => t.takeType === "video");

  const handleGenerateImage = async () => {
    setGeneratingImage(true);
    try {
      await axios.post("/api/generate/image", {
        projectId,
        episodeId,
        sceneId,
        shotId: shot.id,
        prompt: shot.visualPrompt,
        provider,
        candidateCount: 2,
      });
      toast.success("图像候选生成完成");
      const res = await axios.get<TakeData[]>(`/api/shots/${shot.id}/takes`);
      onUpdate({ ...shot, takes: res.data });
    } catch {
      toast.error("图像生成失败");
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    const imageTake = shot.takes.find((t) => t.takeType === "image" && t.isAdopted);
    if (!imageTake) { toast.error("请先采用一个首帧候选"); return; }

    setGeneratingVideo(true);
    try {
      await axios.post("/api/generate/video", {
        projectId,
        episodeId,
        sceneId,
        shotId: shot.id,
        adoptedTakeId: imageTake.id,
        visualPrompt: shot.visualPrompt,
        provider: videoProvider,
      });
      toast.success("视频生成完成");
      const res = await axios.get<TakeData[]>(`/api/shots/${shot.id}/takes`);
      onUpdate({ ...shot, takes: res.data });
    } catch {
      toast.error("视频生成失败");
    } finally {
      setGeneratingVideo(false);
    }
  };

  const handleAdopt = async (takeId: string) => {
    try {
      await axios.post(`/api/shots/${shot.id}/adopt`, { takeId });
      onUpdate({
        ...shot,
        adoptedTakeId: takeId,
        takes: shot.takes.map((t) => ({ ...t, isAdopted: t.id === takeId })),
      });
      toast.success("已设为采用");
    } catch {
      toast.error("操作失败");
    }
  };

  const handleDiscard = async (takeId: string) => {
    try {
      await axios.patch(`/api/shots/${shot.id}/takes/${takeId}`, { isDiscarded: true });
      onUpdate({
        ...shot,
        takes: shot.takes.map((t) =>
          t.id === takeId ? { ...t, isDiscarded: true, isAdopted: false } : t
        ),
      });
      toast.success("已废弃该 Take");
    } catch {
      toast.error("废弃失败");
    }
  };

  return (
    <Card className={cn("overflow-hidden", shot.status === "error" && "border-destructive/40")}>
      <CardHeader className="py-2.5 px-4 bg-muted/20 border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              #{shot.shotOrder.toString().padStart(2, "0")}
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
              {shot.shotType || "MS"}
            </Badge>
            <p className="text-sm font-medium truncate">{shot.actionDesc || shot.visualPrompt.slice(0, 60)}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {imageTakes.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                图×{imageTakes.length}
              </Badge>
            )}
            {videoTakes.length > 0 && (
              <Badge className="text-[10px] px-1.5 py-0">视频×{videoTakes.length}</Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 space-y-4">
          {/* Prompt 显示 */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Visual Prompt</Label>
            <p className="text-xs font-mono bg-muted/50 rounded p-2 leading-relaxed">{shot.visualPrompt}</p>
          </div>
          {shot.dialogue && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">对白</Label>
              <p className="text-sm">「{shot.dialogue}」</p>
            </div>
          )}

          <Separator />

          {/* 生成操作 */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  图像 Provider
                  {recommendedProvider && recommendedProvider === provider && (
                    <span className="text-[9px] text-green-600 bg-green-50 px-1 py-0.5 rounded" title={recommendReason}>
                      推荐
                    </span>
                  )}
                </Label>
                <Select value={provider} onValueChange={(v) => v && setProvider(v)}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seedream">Seedream</SelectItem>
                    <SelectItem value="flux">Flux</SelectItem>
                    <SelectItem value="midjourney">Midjourney</SelectItem>
                    <SelectItem value="dalle3">DALL·E 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateImage}
                disabled={generatingImage}
              >
                {generatingImage ? (
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                ) : (
                  <Wand2 className="size-3.5 mr-1" />
                )}
                生成首帧
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">视频 Provider</Label>
                <Select value={videoProvider} onValueChange={(v) => v && setVideoProvider(v)}>
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kling">Kling</SelectItem>
                    <SelectItem value="hailuo">Hailuo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={handleGenerateVideo}
                disabled={generatingVideo || !shot.takes.some((t) => t.takeType === "image" && t.isAdopted)}
              >
                {generatingVideo ? (
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                ) : (
                  <Video className="size-3.5 mr-1" />
                )}
                生成视频
              </Button>
            </div>

            {shot.dialogue && (
              <Button size="sm" variant="outline">
                <Volume2 className="size-3.5 mr-1" />
                生成配音
              </Button>
            )}

            {(imageTakes.length > 1 || videoTakes.length > 1) && (
              <Button size="sm" variant="ghost" onClick={() => setCompareOpen(true)}>
                对比版本
              </Button>
            )}
          </div>

          {/* Take 瀑布流 */}
          {imageTakes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">首帧候选</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {imageTakes.map((take) => (
                  <TakeCard
                    key={take.id}
                    take={take}
                    isAdopted={take.isAdopted}
                    onAdopt={handleAdopt}
                    onDiscard={handleDiscard}
                  />
                ))}
              </div>
            </div>
          )}

          {videoTakes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">视频候选</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {videoTakes.map((take) => (
                  <TakeCard
                    key={take.id}
                    take={take}
                    isAdopted={take.isAdopted}
                    onAdopt={handleAdopt}
                    onDiscard={handleDiscard}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}

      {/* 多版本对比 Dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>版本对比 · 镜头 #{shot.shotOrder}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
            {[...imageTakes, ...videoTakes].map((take) => (
              <TakeCard
                key={take.id}
                take={take}
                isAdopted={take.isAdopted}
                onAdopt={handleAdopt}
                onDiscard={handleDiscard}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface Props {
  projectId: string;
  episodeId: string;
  scene: {
    id: string;
    sceneOrder: number;
    location: string;
    timeOfDay: string;
    summary: string;
    shots: ShotData[];
  };
}

export function ShotWorkbench({ projectId, episodeId, scene }: Props) {
  const [shots, setShots] = useState<ShotData[]>(scene.shots);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [activeShot, setActiveShot] = useState<string | null>(null);

  const handleShotUpdate = (updated: ShotData) => {
    setShots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleBatchGenerate = async (onlyFailed = false) => {
    setBatchGenerating(true);
    setBatchResult(null);
    try {
      const res = await axios.post<{ queued: number; total: number }>(
        `/api/projects/${projectId}/episodes/${episodeId}/scenes/${scene.id}/batch-generate`,
        { onlyFailed }
      );
      setBatchResult(`已提交 ${res.data.queued}/${res.data.total} 个镜头至生成队列`);
      toast.success(`批量生成已提交 ${res.data.queued} 个镜头`);
    } catch {
      toast.error("批量生成提交失败");
    } finally {
      setBatchGenerating(false);
    }
  };

  const pendingCount = shots.filter((s) => !s.takes.some((t) => t.isAdopted)).length;
  const failedCount = shots.filter((s) =>
    s.takes.some((t) => t.reviews?.[0]?.verdict === "fail")
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono">SC{scene.sceneOrder.toString().padStart(2, "0")}</span>
          <span>·</span>
          <span>{scene.location}</span>
          {scene.timeOfDay && <Badge variant="outline" className="text-[10px]">{scene.timeOfDay}</Badge>}
          {scene.summary && <span className="text-xs truncate max-w-[200px]">· {scene.summary}</span>}
        </div>

        {/* 视图切换 */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            title="列表视图"
            onClick={() => setViewMode("list")}
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={viewMode === "timeline" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            title="时间线视图"
            onClick={() => setViewMode("timeline")}
          >
            <AlignJustify className="size-4" />
          </Button>
        </div>

        {/* 批量操作按钮 */}
        <div className="flex items-center gap-2 shrink-0">
          {failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={batchGenerating}
              onClick={() => handleBatchGenerate(true)}
            >
              重做 {failedCount} 个失败镜头
            </Button>
          )}
          {pendingCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={batchGenerating}
              onClick={() => handleBatchGenerate(false)}
            >
              {batchGenerating ? (
                <Loader2 className="size-3 mr-1 animate-spin" />
              ) : (
                <Wand2 className="size-3 mr-1" />
              )}
              批量生成 ({pendingCount})
            </Button>
          )}
        </div>
      </div>

      {batchResult && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5">
          {batchResult}
        </p>
      )}

      {/* 时间线视图 */}
      {viewMode === "timeline" && (
        <ShotTimeline
          projectId={projectId}
          episodeId={episodeId}
          sceneId={scene.id}
          shots={shots}
          activeShot={activeShot ?? undefined}
          onSelectShot={(id) => {
            setActiveShot(id);
            setViewMode("list");
          }}
          onReordered={(reordered) =>
            setShots((prev) =>
              reordered.map((r) => {
                const full = prev.find((s) => s.id === r.id);
                return full ? { ...full, shotOrder: r.shotOrder } : full!;
              })
            )
          }
        />
      )}

      {/* 列表视图 */}
      {viewMode === "list" && (
        <div className="space-y-2">
          {shots.map((shot) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              projectId={projectId}
              episodeId={episodeId}
              sceneId={scene.id}
              onUpdate={handleShotUpdate}
            />
          ))}
          {shots.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">此场次暂无镜头</p>
          )}
        </div>
      )}
    </div>
  );
}
