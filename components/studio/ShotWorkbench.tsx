"use client";

import { useState, useEffect } from "react";
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
import { MediaPreview } from "@/components/studio/MediaPreview";
import {
  parseBlockMeta,
  type BlockMeta,
  type ShotPipelineStage,
} from "@/lib/studio-contracts";

const IMAGE_PROVIDER_LABELS: Record<string, string> = {
  seedream: "Seedream",
  flux: "Flux",
  midjourney: "Midjourney",
  dalle3: "DALL·E 3",
};

const VIDEO_PROVIDER_LABELS: Record<string, string> = {
  seedance: "Seedance",
};

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
  paramsSnapshotJson?: {
    retryStrategy?: {
      promptHints?: string[];
      preferredAssetTypes?: string[];
      disableContinuityReference?: boolean;
    };
  } | null;
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
  adoptedImageTakeId?: string | null;
  adoptedVideoTakeId?: string | null;
  adoptedAudioTakeId?: string | null;
  pipelineStage?: ShotPipelineStage | string | null;
  exportReadiness?: "ready" | "warn" | "blocked" | string | null;
  blockReason?: string | null;
  blockMeta?: string | BlockMeta | null;
  takes: TakeData[];
}

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  draft: "待开始",
  image_generating: "首帧生成中",
  image_ready: "首帧已就绪",
  video_generating: "视频生成中",
  video_ready: "视频已就绪",
  audio_generating: "音频生成中",
  blocked_for_review: "待人工复核",
  ready_for_export: "可导出",
};

const BLOCK_REASON_LABELS: Record<string, string> = {
  "missing-character-assets": "角色资产不完整",
  "image-qa-failed": "首帧质检未通过",
  "video-qa-failed": "视频质检未通过",
  "audio-qa-failed": "音频质检未通过",
  "continuity-check-failed": "连续性质检未通过",
  "manual-review-required": "需要人工确认",
};

function getAdoptedTakeId(shot: ShotData, takeType: "image" | "video" | "audio") {
  const direct =
    takeType === "image"
      ? shot.adoptedImageTakeId
      : takeType === "video"
        ? shot.adoptedVideoTakeId
        : shot.adoptedAudioTakeId;
  if (direct) return direct;
  return shot.takes.find((take) => take.takeType === takeType && take.isAdopted)?.id ?? null;
}

function getBlockMeta(shot: ShotData): BlockMeta | null {
  if (!shot.blockMeta) return null;
  if (typeof shot.blockMeta === "string") return parseBlockMeta(shot.blockMeta);
  return shot.blockMeta;
}

interface TakeCardProps {
  take: TakeData;
  isAdopted: boolean;
  onAdopt: (takeId: string, takeType: string) => void;
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
      <div className="relative aspect-[4/5] bg-muted lg:aspect-[3/4]">
        {take.localImage ? (
          <MediaPreview
            type={take.localVideo ? "video" : "image"}
            src={take.localVideo ?? take.localImage}
            poster={take.localImage}
            title="Take preview"
            className="absolute inset-0"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <ImageIcon className="size-8" />
          </div>
        )}
        {isAdopted && (
          <div className="absolute top-2 left-2">
            <Badge className="text-xs px-1.5 py-0 bg-primary">已采用</Badge>
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge
            variant="outline"
            className={cn("text-xs px-1.5 py-0 bg-background/80", verdictColor)}
          >
            {verdict === "pass" ? "通过" : verdict === "warn" ? "可用" : verdict === "fail" ? "失败" : "待审"}
          </Badge>
        </div>
      </div>

      {/* 底部信息 */}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between type-meta text-muted-foreground">
          <span className="truncate">{take.provider || "unknown"}</span>
          <div className="flex items-center gap-0.5">
            <Star className="size-3 text-amber-400" />
            <span>{(take.autoScore * 10).toFixed(1)}</span>
          </div>
        </div>
        {take.reviews?.[0]?.details && (
          <p className="type-caption text-muted-foreground truncate">{take.reviews[0].details}</p>
        )}
        {take.paramsSnapshotJson?.retryStrategy?.promptHints?.length ? (
          <p className="type-caption text-amber-700 truncate">
            重试策略：{take.paramsSnapshotJson.retryStrategy.promptHints[0]}
          </p>
        ) : null}
        {take.localAudio && (
          <MediaPreview type="audio" src={take.localAudio} className="mt-1" />
        )}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={isAdopted ? "default" : "outline"}
            className="flex-1 h-7 text-xs"
            onClick={() => onAdopt(take.id, take.takeType)}
            disabled={isAdopted}
          >
            {isAdopted ? <CheckCircle2 className="size-3 mr-1" /> : null}
            {isAdopted ? "已采用" : "采用"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
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
  isHighlighted?: boolean;
  highlightReason?: string;
  highlightRecommendation?: string;
}

function ShotCard({
  shot,
  projectId,
  episodeId,
  sceneId,
  onUpdate,
  isHighlighted = false,
  highlightReason,
  highlightRecommendation,
}: ShotCardProps) {
  const [expanded, setExpanded] = useState(() => isHighlighted);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [provider, setProvider] = useState("seedream");
  const [videoProvider, setVideoProvider] = useState("seedance");
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
  const audioTakes = shot.takes.filter((t) => t.takeType === "audio");
  const adoptedImageTakeId = getAdoptedTakeId(shot, "image");
  const adoptedVideoTakeId = getAdoptedTakeId(shot, "video");
  const adoptedAudioTakeId = getAdoptedTakeId(shot, "audio");
  const pipelineLabel = PIPELINE_STAGE_LABELS[shot.pipelineStage ?? ""] ?? shot.pipelineStage ?? "未标记";
  const blockMeta = getBlockMeta(shot);
  const blockSummary =
    blockMeta?.message ||
    (shot.blockReason ? BLOCK_REASON_LABELS[shot.blockReason] ?? shot.blockReason : null);
  const adoptedPreviewTakes = [adoptedImageTakeId, adoptedVideoTakeId, adoptedAudioTakeId]
    .map((id) => shot.takes.find((take) => take.id === id))
    .filter((take): take is TakeData => Boolean(take));

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
    const imageTake = shot.takes.find((t) => t.id === adoptedImageTakeId);
    if (!imageTake) { toast.error("请先采用一个首帧候选"); return; }

    setGeneratingVideo(true);
    try {
      await axios.post("/api/generate/video", {
        projectId,
        episodeId,
        sceneId,
        shotId: shot.id,
        adoptedImageTakeId: imageTake.id,
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

  const handleAdopt = async (takeId: string, takeType: string) => {
    try {
      await axios.post(`/api/shots/${shot.id}/adopt`, { takeId, takeType });
      onUpdate({
        ...shot,
        adoptedImageTakeId: takeType === "image" ? takeId : adoptedImageTakeId,
        adoptedVideoTakeId: takeType === "video" ? takeId : adoptedVideoTakeId,
        adoptedAudioTakeId: takeType === "audio" ? takeId : adoptedAudioTakeId,
        pipelineStage:
          takeType === "image" ? "image_ready" : takeType === "video" ? "video_ready" : "ready_for_export",
        takes: shot.takes.map((t) => ({
          ...t,
          isAdopted: t.takeType === takeType ? t.id === takeId : t.isAdopted,
          isDiscarded: t.id === takeId ? false : t.isDiscarded,
        })),
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
    <Card
      className={cn(
        "overflow-hidden",
        shot.exportReadiness === "blocked" && "border-destructive/40",
        shot.pipelineStage === "blocked_for_review" && "border-amber-500/40",
        isHighlighted && "ring-2 ring-primary border-primary/50"
      )}
    >
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono type-meta text-muted-foreground shrink-0">
              #{shot.shotOrder.toString().padStart(2, "0")}
            </span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0">
              {shot.shotType || "MS"}
            </Badge>
            <Badge
              variant={shot.pipelineStage === "blocked_for_review" ? "destructive" : "secondary"}
              className="text-xs px-1.5 py-0 shrink-0"
            >
              {pipelineLabel}
            </Badge>
            <p className="text-sm font-medium truncate">{shot.actionDesc || shot.visualPrompt.slice(0, 60)}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {imageTakes.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                图×{imageTakes.length}
              </Badge>
            )}
            {videoTakes.length > 0 && (
              <Badge className="text-xs px-1.5 py-0">视频×{videoTakes.length}</Badge>
            )}
            {audioTakes.length > 0 && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">音频×{audioTakes.length}</Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 space-y-4">
          {isHighlighted && (highlightReason || highlightRecommendation) ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-primary">从导出前检查定位到此镜头</p>
              {highlightReason ? (
                <p className="mt-1 text-sm text-foreground">风险原因：{highlightReason}</p>
              ) : null}
              {highlightRecommendation ? (
                <p className="mt-1 text-sm text-muted-foreground">建议动作：{highlightRecommendation}</p>
              ) : null}
            </div>
          ) : null}
          {(shot.pipelineStage === "blocked_for_review" || blockSummary) && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-amber-500/40 text-amber-700">
                  流水线阻断
                </Badge>
                {blockMeta?.stage ? (
                  <span className="type-meta text-amber-800/80">阶段：{blockMeta.stage}</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-amber-900">{blockSummary ?? "等待人工复核"}</p>
              {blockMeta?.details?.length ? (
                <ul className="mt-2 space-y-1 text-xs text-amber-900/80">
                  {blockMeta.details.slice(0, 3).map((detail) => (
                    <li key={detail}>• {detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.95fr)]">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="type-meta text-muted-foreground">Visual Prompt</Label>
                <p className="rounded-xl bg-muted/50 p-3 font-mono type-meta leading-relaxed">{shot.visualPrompt}</p>
              </div>
              {shot.dialogue && (
                <div className="space-y-1.5">
                  <Label className="type-meta text-muted-foreground">对白</Label>
                  <p className="type-body-strong">「{shot.dialogue}」</p>
                </div>
              )}
            </div>

            {adoptedPreviewTakes.length > 0 && (() => {
              return (
                <div className="space-y-1.5">
                  <Label className="type-meta text-muted-foreground">采用结果预览</Label>
                  <div className="grid gap-3">
                    {adoptedPreviewTakes.map((adopted) => (
                      <div key={adopted.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            {adopted.takeType === "image" ? "首帧采用" : adopted.takeType === "video" ? "视频采用" : "音频采用"}
                          </Badge>
                          <span className="type-meta text-muted-foreground">{adopted.provider}</span>
                        </div>
                        {(adopted.localVideo || adopted.localImage) && (
                          <MediaPreview
                            type={adopted.localVideo ? "video" : "image"}
                            src={adopted.localVideo ?? adopted.localImage}
                            poster={adopted.localImage}
                            className="aspect-video"
                          />
                        )}
                        {adopted.localAudio && (
                          <MediaPreview type="audio" src={adopted.localAudio} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          <Separator />

          {/* 生成操作 */}
          <div className="rounded-2xl border border-border/60 bg-muted/15 p-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                <Label className="type-meta flex items-center gap-1">
                  图像 Provider
                  {recommendedProvider && recommendedProvider === provider && (
                    <span className="type-caption text-green-600 bg-green-50 px-1 py-0.5 rounded" title={recommendReason}>
                      推荐
                    </span>
                  )}
                </Label>
                <Select value={provider} onValueChange={(v) => v && setProvider(v)}>
                  <SelectTrigger className="h-9 w-36 text-sm">
                    <SelectValue>
                      {IMAGE_PROVIDER_LABELS[provider] ?? provider}
                    </SelectValue>
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
                  className="h-9"
                >
                  {generatingImage ? (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                ) : (
                  <Wand2 className="size-3.5 mr-1" />
                )}
                生成首帧
              </Button>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                <Label className="type-meta">视频 Provider</Label>
                <Select value={videoProvider} onValueChange={(v) => v && setVideoProvider(v)}>
                  <SelectTrigger className="h-9 w-28 text-sm">
                    <SelectValue>
                      {VIDEO_PROVIDER_LABELS[videoProvider] ?? videoProvider}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seedance">Seedance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
                <Button
                  size="sm"
                  onClick={handleGenerateVideo}
                  disabled={generatingVideo || !adoptedImageTakeId}
                  className="h-9"
                >
                  {generatingVideo ? (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                ) : (
                  <Video className="size-3.5 mr-1" />
                )}
                生成视频
              </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                {shot.dialogue && (
                  <Button size="sm" variant="outline" className="h-9" disabled>
                    <Volume2 className="size-3.5 mr-1" />
                    配音入口待接线
                  </Button>
                )}

                {(imageTakes.length > 1 || videoTakes.length > 1) && (
                  <Button size="sm" variant="ghost" className="h-9" onClick={() => setCompareOpen(true)}>
                    对比版本
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Take 瀑布流 */}
          {imageTakes.length > 0 && (
            <div className="space-y-2">
              <Label className="type-meta text-muted-foreground">首帧候选</Label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {imageTakes.map((take) => (
                  <TakeCard
                    key={take.id}
                    take={take}
                    isAdopted={take.id === adoptedImageTakeId}
                    onAdopt={handleAdopt}
                    onDiscard={handleDiscard}
                  />
                ))}
              </div>
            </div>
          )}

          {videoTakes.length > 0 && (
            <div className="space-y-2">
              <Label className="type-meta text-muted-foreground">视频候选</Label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {videoTakes.map((take) => (
                  <TakeCard
                    key={take.id}
                    take={take}
                    isAdopted={take.id === adoptedVideoTakeId}
                    onAdopt={handleAdopt}
                    onDiscard={handleDiscard}
                  />
                ))}
              </div>
            </div>
          )}

          {audioTakes.length > 0 && (
            <div className="space-y-2">
              <Label className="type-meta text-muted-foreground">音频候选</Label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {audioTakes.map((take) => (
                  <TakeCard
                    key={take.id}
                    take={take}
                    isAdopted={take.id === adoptedAudioTakeId}
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
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>版本对比 · 镜头 #{shot.shotOrder}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3 xl:grid-cols-4">
            {[...imageTakes, ...videoTakes, ...audioTakes].map((take) => (
              <TakeCard
                key={take.id}
                take={take}
                isAdopted={
                  take.takeType === "image"
                    ? take.id === adoptedImageTakeId
                    : take.takeType === "video"
                      ? take.id === adoptedVideoTakeId
                      : take.id === adoptedAudioTakeId
                }
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
  highlightShotId?: string;
  highlightReason?: string;
  highlightRecommendation?: string;
  scene: {
    id: string;
    sceneOrder: number;
    location: string;
    timeOfDay: string;
    summary: string;
    shots: ShotData[];
  };
}

export function ShotWorkbench({
  projectId,
  episodeId,
  scene,
  highlightShotId,
  highlightReason,
  highlightRecommendation,
}: Props) {
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
  const blockedCount = shots.filter((s) => s.pipelineStage === "blocked_for_review").length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 type-body text-muted-foreground">
              <span className="font-mono">SC{scene.sceneOrder.toString().padStart(2, "0")}</span>
              <span>·</span>
              <span>{scene.location}</span>
              {scene.timeOfDay && <Badge variant="outline" className="text-xs">{scene.timeOfDay}</Badge>}
            </div>
            {scene.summary ? (
              <p className="max-w-4xl text-sm leading-6 text-muted-foreground">{scene.summary}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                {shots.length} 个镜头
              </Badge>
              <Badge variant="outline" className="px-2 py-0.5 text-xs">
                {pendingCount} 个待采用
              </Badge>
              {blockedCount > 0 ? (
                <Badge variant="outline" className="px-2 py-0.5 text-xs border-amber-500/40 text-amber-700">
                  {blockedCount} 个待复核
                </Badge>
              ) : null}
              {failedCount > 0 ? (
                <Badge variant="destructive" className="px-2 py-0.5 text-xs">
                  {failedCount} 个失败
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/60 p-1">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="size-8"
                title="列表视图"
                onClick={() => setViewMode("list")}
              >
                <List className="size-4" />
              </Button>
              <Button
                variant={viewMode === "timeline" ? "secondary" : "ghost"}
                size="icon"
                className="size-8"
                title="时间线视图"
                onClick={() => setViewMode("timeline")}
              >
                <AlignJustify className="size-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {failedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm text-destructive border-destructive/30 hover:bg-destructive/10"
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
                  className="h-9 text-sm"
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
        </div>
      </div>

      {batchResult && (
        <p className="type-meta text-muted-foreground bg-muted/50 rounded px-3 py-2">
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
              isHighlighted={highlightShotId === shot.id}
              highlightReason={highlightShotId === shot.id ? highlightReason : undefined}
              highlightRecommendation={highlightShotId === shot.id ? highlightRecommendation : undefined}
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
