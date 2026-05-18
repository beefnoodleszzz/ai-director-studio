"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import {
  Download,
  Film,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BookImage,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { MangaTemplateSelector } from "@/components/studio/MangaTemplateSelector";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

interface Episode {
  id: string;
  episodeNum: number;
  title: string;
  status: string;
}

interface ExportRecord {
  id: string;
  episodeId: string | null;
  exportType: string;
  status: string;
  outputPath: string;
  manifestPath: string;
  totalShots: number;
  duration: number;
  errorReason: string;
  exportedAt: string | null;
  createdAt: string;
  preflight?: {
    continuityAudit?: {
      summary?: string;
      issues?: Array<{
        shotId: string;
        sceneId?: string;
        sceneOrder: number;
        shotOrder: number;
        tags: string[];
        message: string;
        recommendation: string;
      }>;
    };
    counts?: {
      continuityWarnShots?: number;
      missingVideoShots?: number;
      missingAudioShots?: number;
    };
  } | null;
}

const STATUS_ICON = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle2,
  failed: AlertTriangle,
};

const ASPECT_LABELS: Record<string, string> = {
  "9:16": "9:16（竖屏）",
  "16:9": "16:9（横屏）",
};

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEpId, setSelectedEpId] = useState("");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [assembling, setAssembling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exportPreview, setExportPreview] = useState<{
    ok: boolean;
    totalShots: number;
    preflight: ExportRecord["preflight"];
  } | null>(null);

  // 漫剧配置
  const [mangaTemplateId, setMangaTemplateId] = useState("hero-plus-two");
  const [exportingManga, setExportingManga] = useState(false);
  const [mangaPreviewUrl, setMangaPreviewUrl] = useState<string | null>(null);
  const [dramaPreviewUrl, setDramaPreviewUrl] = useState<string | null>(null);

  const refreshExports = () =>
    axios.get<ExportRecord[]>(`/api/projects/${projectId}/exports`).then((r) => setExports(r.data));

  useEffect(() => {
    Promise.all([
      axios.get<Episode[]>(`/api/projects/${projectId}/episodes`),
      axios.get<ExportRecord[]>(`/api/projects/${projectId}/exports`),
    ])
      .then(([epRes, exportRes]) => {
        setEpisodes(epRes.data);
        setExports(exportRes.data);
        if (epRes.data.length > 0) setSelectedEpId(epRes.data[0].id);
      })
      .catch(() => toast.error("加载失败"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleAssemble = async () => {
    if (!selectedEpId) { toast.error("请选择要导出的集数"); return; }
    setAssembling(true);
    try {
      const res = await axios.post("/api/generate/assemble", { projectId, episodeId: selectedEpId, aspect });
      toast.success(`成片导出完成，共 ${res.data.totalShots} 个镜头`);
      setDramaPreviewUrl(res.data.outputPath ?? null);
      await refreshExports();
    } catch {
      toast.error("合成失败，请确认所有镜头已生成视频");
    } finally {
      setAssembling(false);
    }
  };

  const handlePreviewAssemble = async () => {
    if (!selectedEpId) { toast.error("请选择要导出的集数"); return; }
    setPreviewing(true);
    try {
      const res = await axios.post<{
        ok: boolean;
        totalShots: number;
        preflight: ExportRecord["preflight"];
      }>("/api/generate/assemble", {
        projectId,
        episodeId: selectedEpId,
        aspect,
        previewOnly: true,
      });
      setExportPreview(res.data);
      toast.success(res.data.ok ? "导出前检查完成" : "导出前检查发现风险");
    } catch {
      toast.error("导出前检查失败");
    } finally {
      setPreviewing(false);
    }
  };

  const handleMangaExport = async () => {
    if (!selectedEpId) { toast.error("请选择要导出的集数"); return; }
    setExportingManga(true);
    setMangaPreviewUrl(null);
    try {
      const res = await axios.post<{ longStripUrl: string | null; totalPages: number; totalShots: number }>(
        "/api/export/manga",
        { projectId, episodeId: selectedEpId, templateId: mangaTemplateId }
      );
      toast.success(`漫剧导出完成！共 ${res.data.totalPages} 页 · ${res.data.totalShots} 个镜头`);
      if (res.data.longStripUrl) {
        setMangaPreviewUrl(res.data.longStripUrl);
      }
      await refreshExports();
    } catch {
      toast.error("漫剧导出失败，请确认镜头均有采用首帧");
    } finally {
      setExportingManga(false);
    }
  };

  const dramExports = exports.filter((e) => e.exportType === "short-drama");
  const mangaExports = exports.filter((e) => e.exportType === "manga");
  const selectedEpisode = episodes.find((ep) => ep.id === selectedEpId);

  return (
    <ProjectPageShell
      title="导出"
      description="统一导出短剧视频与漫剧长图，并查看每次导出的历史记录、Manifest 和成片预览。"
      backHref={`/projects/${projectId}`}
      contentClassName="app-page-narrow"
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* 集数选择（共用） */}
          <div className="max-w-sm space-y-1.5">
            <Label>选择集数</Label>
            <Select value={selectedEpId} onValueChange={(v) => v && setSelectedEpId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="选择集数">
                  {selectedEpisode ? selectedEpisode.title || `第 ${selectedEpisode.episodeNum} 集` : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {episodes.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id}>
                    {ep.title || `第 ${ep.episodeNum} 集`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="drama">
            <TabsList>
              <TabsTrigger value="drama">
                <Film className="size-4 mr-1.5" /> 短剧视频
              </TabsTrigger>
              <TabsTrigger value="manga">
                <BookImage className="size-4 mr-1.5" /> 漫剧长图
              </TabsTrigger>
            </TabsList>

            {/* ── 短剧导出 ── */}
            <TabsContent value="drama" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">合成短剧视频</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                    短剧导出现在以“已采用视频”为主素材，若后续音频采用链路已接入，也会优先使用已采用音频。漫画导出仍只依赖“已采用首帧”。
                  </div>
                  <div className="max-w-xs space-y-1.5">
                    <Label>画幅</Label>
                    <Select value={aspect} onValueChange={(v) => v && setAspect(v as "9:16" | "16:9")}>
                      <SelectTrigger>
                        <SelectValue>{ASPECT_LABELS[aspect] ?? aspect}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9:16">9:16（竖屏）</SelectItem>
                        <SelectItem value="16:9">16:9（横屏）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handlePreviewAssemble} disabled={previewing || !selectedEpId}>
                      {previewing ? <Loader2 className="size-4 animate-spin mr-2" /> : <AlertTriangle className="size-4 mr-2" />}
                      {previewing ? "检查中…" : "导出前检查"}
                    </Button>
                    <Button onClick={handleAssemble} disabled={assembling || !selectedEpId}>
                    {assembling ? <Loader2 className="size-4 animate-spin mr-2" /> : <Film className="size-4 mr-2" />}
                    {assembling ? "合成中…" : "开始合成成片"}
                    </Button>
                  </div>
                  {exportPreview?.preflight ? (
                    <div className="rounded-xl border border-border/60 bg-background px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">导出前预览</p>
                        <Badge variant={exportPreview.ok ? "default" : "outline"}>
                          {exportPreview.ok ? "可导出" : "建议先处理风险"}
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
                        <p>镜头总数：{exportPreview.totalShots}</p>
                        <p>连续性风险：{exportPreview.preflight.counts?.continuityWarnShots ?? 0}</p>
                        <p>缺视频：{exportPreview.preflight.counts?.missingVideoShots ?? 0}</p>
                        <p>缺音频：{exportPreview.preflight.counts?.missingAudioShots ?? 0}</p>
                      </div>
                      {exportPreview.preflight.continuityAudit?.summary ? (
                        <p className="mt-2 text-muted-foreground">
                          {exportPreview.preflight.continuityAudit.summary}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {dramaPreviewUrl && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">短剧成片预览</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <MediaPreview type="video" src={dramaPreviewUrl} className="aspect-video" />
                    <a href={dramaPreviewUrl} download>
                      <Button variant="outline" size="sm">
                        <Download className="size-4 mr-1.5" /> 下载短剧视频
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              )}

              <ExportHistory
                records={dramExports}
                episodes={episodes}
                projectId={projectId}
                onDeleted={(exportId) => setExports((prev) => prev.filter((e) => e.id !== exportId))}
              />
            </TabsContent>

            {/* ── 漫剧导出 ── */}
            <TabsContent value="manga" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">导出漫剧竖版长图</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                    漫剧导出仍以“已采用首帧”为准，不要求视频或音频已采用。
                  </div>
                  <div>
                    <Label className="mb-3 block">选择格子模板</Label>
                    <MangaTemplateSelector
                      value={mangaTemplateId}
                      onChange={setMangaTemplateId}
                    />
                  </div>

                  <Button onClick={handleMangaExport} disabled={exportingManga || !selectedEpId}>
                    {exportingManga ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <BookImage className="size-4 mr-2" />
                    )}
                    {exportingManga ? "生成漫剧中…" : "导出漫剧"}
                  </Button>
                </CardContent>
              </Card>

              {/* 漫剧预览 */}
              {mangaPreviewUrl && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">竖版长图预览</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[600px] overflow-y-auto rounded-lg border">
                      <Image
                        src={mangaPreviewUrl}
                        alt="漫剧长图预览"
                        width={414}
                        height={2000}
                        className="w-full"
                        unoptimized
                      />
                    </div>
                    <a href={mangaPreviewUrl} download className="mt-3 inline-block">
                      <Button variant="outline" size="sm">
                        <Download className="size-4 mr-1.5" /> 下载长图
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              )}

              <ExportHistory
                records={mangaExports}
                episodes={episodes}
                projectId={projectId}
                onDeleted={(exportId) => setExports((prev) => prev.filter((e) => e.id !== exportId))}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </ProjectPageShell>
  );
}

function ExportHistoryRow({
  record,
  ep,
  projectId,
  onDeleted,
}: {
  record: ExportRecord;
  ep?: Episode;
  projectId: string;
  onDeleted: (exportId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [redoingShotId, setRedoingShotId] = useState<string | null>(null);

  const Icon = STATUS_ICON[record.status as keyof typeof STATUS_ICON] ?? Film;

  const loadManifest = async () => {
    if (manifest) { setExpanded(!expanded); return; }
    if (!record.manifestPath) { setExpanded(!expanded); return; }
    setLoadingManifest(true);
    try {
      const res = await axios.get<Record<string, unknown>>(record.manifestPath);
      setManifest(res.data);
      setExpanded(true);
    } catch {
      setExpanded(!expanded);
    } finally {
      setLoadingManifest(false);
    }
  };

  const handleDelete = async () => {
    try {
      const qs = new URLSearchParams({
        exportId: record.id,
        deleteFiles: "true",
      });
      await axios.delete(`/api/projects/${projectId}/exports?${qs.toString()}`);
      onDeleted(record.id);
      toast.success("导出记录已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleRedoShot = async (issue: {
    shotId: string;
    recommendation: string;
    tags: string[];
  }) => {
    setRedoingShotId(issue.shotId);
    try {
      await axios.post(`/api/shots/${issue.shotId}/redo`, {
        strategyHint: issue.recommendation,
        reasonTags: issue.tags,
      });
      toast.success("已按建议提交镜头重做");
    } catch {
      toast.error("提交镜头重做失败");
    } finally {
      setRedoingShotId(null);
    }
  };

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div
          className="flex items-center justify-between gap-3 cursor-pointer"
          onClick={loadManifest}
        >
          <div className="flex items-center gap-3">
            <Icon className={`size-5 ${record.status === "completed" ? "text-green-500" : record.status === "failed" ? "text-destructive" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-medium">
                {ep ? ep.title || `第 ${ep.episodeNum} 集` : "未知集数"}
              </p>
              <p className="text-sm text-muted-foreground">
                {record.totalShots} 个镜头
                {record.exportedAt && ` · ${new Date(record.exportedAt).toLocaleString("zh-CN")}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={record.status === "completed" ? "default" : "outline"} className="text-xs">
              {record.status === "completed" ? "完成" : record.status === "failed" ? "失败" : "处理中"}
            </Badge>
            {record.preflight?.counts?.continuityWarnShots ? (
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-700">
                连续性风险 {record.preflight.counts.continuityWarnShots}
              </Badge>
            ) : null}
            {loadingManifest && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            {record.status === "completed" && record.outputPath && (
              <a href={record.outputPath} download onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  <Download className="size-3.5 mr-1" /> 下载
                </Button>
              </a>
            )}
            {record.manifestPath && (
              <a href={record.manifestPath} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="h-7 text-xs">
                  Manifest
                </Button>
              </a>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
            >
              删除
            </Button>
          </div>
        </div>

        {expanded && manifest && (
          <div className="mt-3 pt-3 border-t">
            {record.errorReason ? (
              <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {record.errorReason}
              </div>
            ) : null}
            <p className="text-sm font-medium text-muted-foreground mb-2">导出 Manifest 详情</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {[
                { label: "类型", value: String(manifest.type ?? "—") },
                { label: "模板", value: String(manifest.templateId ?? "—") },
                { label: "页数", value: String(manifest.totalPages ?? "—") },
                { label: "镜头数", value: String(manifest.totalShots ?? "—") },
                { label: "页宽", value: manifest.pageWidth ? `${manifest.pageWidth}px` : "—" },
                { label: "页高", value: manifest.pageHeight ? `${manifest.pageHeight}px` : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
            {"preflight" in manifest && manifest.preflight && typeof manifest.preflight === "object" ? (
              <div className="mt-3 space-y-2">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <p className="text-sm font-medium text-amber-800">整集连续性总检</p>
                  <p className="mt-1 text-sm text-amber-900/80">
                    {String((manifest.preflight as { continuityAudit?: { summary?: string } }).continuityAudit?.summary ?? "未提供连续性总检结果")}
                  </p>
                </div>
                {Array.isArray((manifest.preflight as { continuityAudit?: { issues?: unknown[] } }).continuityAudit?.issues) &&
                ((manifest.preflight as { continuityAudit?: { issues?: unknown[] } }).continuityAudit?.issues?.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    {((manifest.preflight as { continuityAudit?: { issues?: Array<{ shotId: string; sceneId?: string; shotOrder: number; tags: string[]; recommendation: string }> } }).continuityAudit?.issues ?? [])
                      .slice(0, 3)
                      .map((issue) => (
                        <div key={issue.shotId} className="rounded-xl border px-3 py-2">
                          <p className="text-sm font-medium">镜头 #{issue.shotOrder}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {issue.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{issue.recommendation}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={redoingShotId === issue.shotId}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRedoShot(issue);
                              }}
                            >
                              {redoingShotId === issue.shotId ? (
                                <Loader2 className="mr-1 size-3 animate-spin" />
                              ) : null}
                              按建议重做
                            </Button>
                            {issue.sceneId ? (
                              <Link
                                href={`/projects/${projectId}/episodes/${record.episodeId}/scenes/${issue.sceneId}?shotId=${issue.shotId}&reason=${encodeURIComponent(issue.tags.join(", "))}&recommendation=${encodeURIComponent(issue.recommendation)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button size="sm" variant="ghost" className="h-7 text-xs">
                                  去该镜头修复
                                </Button>
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {Array.isArray(manifest.pages) && manifest.pages.length > 0 && (
              <div className="mt-2">
                <p className="text-sm text-muted-foreground mb-1">页面列表（前 5 页）</p>
                <div className="flex gap-1 flex-wrap">
                  {(manifest.pages as Array<{ pageIndex: number; path: string }>)
                    .slice(0, 5)
                    .map((p) => (
                      <a key={p.pageIndex} href={p.path} target="_blank" rel="noreferrer">
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                          P{p.pageIndex + 1}
                        </Badge>
                      </a>
                    ))}
                  {manifest.pages.length > 5 && (
                    <Badge variant="secondary" className="text-xs">+{manifest.pages.length - 5} 页</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExportHistory({
  records,
  episodes,
  projectId,
  onDeleted,
}: {
  records: ExportRecord[];
  episodes: Episode[];
  projectId: string;
  onDeleted: (exportId: string) => void;
}) {
  if (records.length === 0) return null;
  return (
    <div className="space-y-3">
      <Separator />
      <p className="text-sm font-medium text-muted-foreground">历史记录</p>
      <div className="space-y-2">
        {records.map((record) => (
          <ExportHistoryRow
            key={record.id}
            record={record}
            ep={episodes.find((e) => e.id === record.episodeId)}
            projectId={projectId}
            onDeleted={onDeleted}
          />
        ))}
      </div>
    </div>
  );
}
