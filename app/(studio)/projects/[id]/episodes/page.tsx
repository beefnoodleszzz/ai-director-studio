"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BookOpen, ArrowRight, Loader2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

interface Episode {
  id: string;
  episodeNum: number;
  title: string;
  summary: string;
  hook: string;
  cliffhanger: string;
  productionStage: string;
  scenes: {
    id: string;
    shots: {
      id: string;
      pipelineStage: string;
      exportReadiness: string;
      dramaticTag?: string;
      risk?: {
        isCritical: boolean;
        missingVideo: boolean;
        imageFallbackOnly: boolean;
        criticalNeedsVideo: boolean;
      };
    }[];
  }[];
}

const EPISODE_STAGE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  idea: { label: "构思中", variant: "outline" },
  outline_ready: { label: "大纲就绪", variant: "outline" },
  cast_locked: { label: "角色锁定", variant: "secondary" },
  script_ready: { label: "剧本就绪", variant: "secondary" },
  breakdown_ready: { label: "拆解完成", variant: "secondary" },
  production_ready: { label: "可生产/导出", variant: "default" },
};

export default function EpisodesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    axios
      .get<Episode[]>(`/api/projects/${projectId}/episodes`)
      .then((res) => setEpisodes(res.data))
      .catch(() => toast.error("加载失败"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const nextNum = (episodes?.length ?? 0) + 1;
      const res = await axios.post<Episode>(`/api/projects/${projectId}/episodes`, {
        episodeNum: nextNum,
        title: `第 ${nextNum} 集`,
      });
      setEpisodes((prev) => [...prev, res.data]);
      toast.success(`第 ${nextNum} 集已创建`);
    } catch {
      toast.error("创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProjectPageShell
      title="剧集管理"
      description={`${episodes.length} 集内容。创建剧集后即可录入剧本、拆解场次并进入镜头工作台。`}
      backHref={`/projects/${projectId}`}
      contentClassName="app-page-narrow"
      actions={
        <Button size="sm" onClick={handleCreate} disabled={creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Plus className="size-3.5 mr-1" />}
          新建集数
        </Button>
      }
    >

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : episodes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <div>
              <p className="font-medium">还没有集数</p>
              <p className="text-sm text-muted-foreground mt-0.5">新建第一集开始创作</p>
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              <Plus className="size-4 mr-1" />
              新建第一集
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {episodes.map((ep) => {
            const shots = ep.scenes.flatMap((s) => s.shots);
            const done = shots.filter((sh) => sh.pipelineStage === "ready_for_export" || sh.pipelineStage === "video_ready").length;
            const criticalShots = shots.filter((sh) => sh.risk?.isCritical);
            const criticalVideoRisks = shots.filter((sh) => sh.risk?.criticalNeedsVideo).length;
            const stageInfo = EPISODE_STAGE_LABELS[ep.productionStage] ?? EPISODE_STAGE_LABELS.idea;
            return (
              <Link key={ep.id} href={`/projects/${projectId}/episodes/${ep.id}`}>
                <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                  <CardHeader className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-muted/70 flex items-center justify-center text-sm font-mono font-semibold">
                          EP{ep.episodeNum}
                        </div>
                        <div>
                          <p className="type-body-strong">{ep.title || `第 ${ep.episodeNum} 集`}</p>
                          <p className="type-meta text-muted-foreground mt-1">
                            {shots.length} 个镜头
                            {shots.length > 0 && ` · ${done}/${shots.length} 已生成`}
                            {criticalShots.length > 0 && ` · ${criticalShots.length} 个关键镜头`}
                            {criticalVideoRisks > 0 && ` · ${criticalVideoRisks} 个关键镜头待视频化`}
                            {ep.summary && ` · ${ep.summary.slice(0, 40)}…`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {criticalVideoRisks > 0 ? (
                          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-700">
                            关键镜头风险
                          </Badge>
                        ) : null}
                        <Badge
                          variant={stageInfo.variant}
                          className="text-[10px]"
                        >
                          {stageInfo.label}
                        </Badge>
                        <ArrowRight className="size-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </ProjectPageShell>
  );
}
