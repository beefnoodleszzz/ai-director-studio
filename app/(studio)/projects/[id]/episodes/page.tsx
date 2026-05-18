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
  status: string;
  scenes: { id: string; shots: { id: string; status: string }[] }[];
}

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
            const done = shots.filter((sh) => sh.status === "video_done").length;
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
                            {ep.summary && ` · ${ep.summary.slice(0, 40)}…`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={ep.status === "completed" ? "default" : ep.status === "in-progress" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {ep.status === "completed" ? "已完成" : ep.status === "in-progress" ? "制作中" : "草稿"}
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
