"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
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
}

const STATUS_ICON = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle2,
  failed: AlertTriangle,
};

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEpId, setSelectedEpId] = useState("");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [assembling, setAssembling] = useState(false);

  // 漫剧配置
  const [mangaTemplateId, setMangaTemplateId] = useState("hero-plus-two");
  const [exportingManga, setExportingManga] = useState(false);
  const [mangaPreviewUrl, setMangaPreviewUrl] = useState<string | null>(null);

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
      await refreshExports();
    } catch {
      toast.error("合成失败，请确认所有镜头已生成视频");
    } finally {
      setAssembling(false);
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="icon" className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">导出</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            短剧视频 · 漫剧竖版长图 · 双模态产线
          </p>
        </div>
      </div>

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
                <SelectValue placeholder="选择集数" />
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
                  <div className="max-w-xs space-y-1.5">
                    <Label>画幅</Label>
                    <Select value={aspect} onValueChange={(v) => v && setAspect(v as "9:16" | "16:9")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9:16">9:16（竖屏）</SelectItem>
                        <SelectItem value="16:9">16:9（横屏）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAssemble} disabled={assembling || !selectedEpId}>
                    {assembling ? <Loader2 className="size-4 animate-spin mr-2" /> : <Film className="size-4 mr-2" />}
                    {assembling ? "合成中…" : "开始合成成片"}
                  </Button>
                </CardContent>
              </Card>

              <ExportHistory records={dramExports} episodes={episodes} />
            </TabsContent>

            {/* ── 漫剧导出 ── */}
            <TabsContent value="manga" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">导出漫剧竖版长图</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
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

              <ExportHistory records={mangaExports} episodes={episodes} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function ExportHistoryRow({ record, ep }: { record: ExportRecord; ep?: Episode }) {
  const [expanded, setExpanded] = useState(false);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);

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
              <p className="text-xs text-muted-foreground">
                {record.totalShots} 个镜头
                {record.exportedAt && ` · ${new Date(record.exportedAt).toLocaleString("zh-CN")}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={record.status === "completed" ? "default" : "outline"} className="text-[10px]">
              {record.status === "completed" ? "完成" : record.status === "failed" ? "失败" : "处理中"}
            </Badge>
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
          </div>
        </div>

        {expanded && manifest && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">导出 Manifest 详情</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
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
            {Array.isArray(manifest.pages) && manifest.pages.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">页面列表（前 5 页）</p>
                <div className="flex gap-1 flex-wrap">
                  {(manifest.pages as Array<{ pageIndex: number; path: string }>)
                    .slice(0, 5)
                    .map((p) => (
                      <a key={p.pageIndex} href={p.path} target="_blank" rel="noreferrer">
                        <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted">
                          P{p.pageIndex + 1}
                        </Badge>
                      </a>
                    ))}
                  {manifest.pages.length > 5 && (
                    <Badge variant="secondary" className="text-[10px]">+{manifest.pages.length - 5} 页</Badge>
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
}: {
  records: ExportRecord[];
  episodes: Episode[];
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
          />
        ))}
      </div>
    </div>
  );
}
