"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Wand2, Loader2, Clapperboard, ArrowRight, AlertCircle } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { EmotionCurveEditor } from "@/components/studio/EmotionCurveEditor";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";
import { SectionHeading } from "@/components/studio/SectionHeading";

interface Shot {
  id: string;
  shotOrder: number;
  shotType: string;
  actionDesc: string;
  visualPrompt: string;
  dialogue: string;
  status: string;
  readiness: string;
  takes: { id: string; takeType: string; isAdopted: boolean; localImage: string | null; localVideo: string | null; autoScore: number }[];
}

interface Scene {
  id: string;
  sceneOrder: number;
  location: string;
  timeOfDay: string;
  summary: string;
  emotionArc: string;
  status: string;
  shots: Shot[];
}

interface Episode {
  id: string;
  episodeNum: number;
  title: string;
  summary: string;
  hook: string;
  cliffhanger: string;
  status: string;
  scenes: Scene[];
}

export default function EpisodeDetailPage({
  params,
}: {
  params: Promise<{ id: string; epId: string }>;
}) {
  const { id: projectId, epId } = use(params);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [script, setScript] = useState("");
  const [breakingDown, setBreakingDown] = useState(false);
  const [newCharacters, setNewCharacters] = useState<{ name: string; description: string }[]>([]);
  const [pendingData, setPendingData] = useState<unknown>(null);

  useEffect(() => {
    axios
      .get<Episode>(`/api/projects/${projectId}/episodes/${epId}`)
      .then((res) => setEpisode(res.data))
      .catch(() => toast.error("加载失败"))
      .finally(() => setLoading(false));
  }, [projectId, epId]);

  const handleBreakdown = async () => {
    if (!script.trim()) { toast.error("请输入剧本内容"); return; }
    setBreakingDown(true);
    try {
      const res = await axios.post("/api/generate/script", {
        projectId,
        episodeId: epId,
        script,
      });
      if (res.data.status === "NEED_CHARACTER_SETUP") {
        setNewCharacters(res.data.newCharacters ?? []);
        setPendingData(res.data.pendingData);
        toast.warning(`发现 ${res.data.newCharacters.length} 个新角色，请先在角色库中完善设定`);
      } else {
        toast.success(`拆解完成：${res.data.sceneCount} 个场次，${res.data.shotCount} 个镜头`);
        const updated = await axios.get<Episode>(`/api/projects/${projectId}/episodes/${epId}`);
        setEpisode(updated.data);
        setScript("");
      }
    } catch {
      toast.error("剧本拆解失败，请检查 AI 配置");
    } finally {
      setBreakingDown(false);
    }
  };

  const handleResume = async () => {
    if (!pendingData) return;
    setBreakingDown(true);
    try {
      await axios.post("/api/generate/script", { projectId, episodeId: epId, pendingData });
      const updated = await axios.get<Episode>(`/api/projects/${projectId}/episodes/${epId}`);
      setEpisode(updated.data);
      setNewCharacters([]);
      setPendingData(null);
      toast.success("场次和镜头已写入");
    } catch {
      toast.error("恢复失败");
    } finally {
      setBreakingDown(false);
    }
  };

  if (loading) return <div className="app-page-narrow py-16 flex justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  if (!episode) return <div className="app-page-narrow py-8 text-center text-muted-foreground">集数不存在</div>;

  return (
    <ProjectPageShell
      title={episode.title || `第 ${episode.episodeNum} 集`}
      description={episode.summary || "录入剧本、拆解场次，并进入每个场次的镜头工作台。"}
      backHref={`/projects/${projectId}/episodes`}
      contentClassName="app-page-narrow"
      stickyHeader
      actions={
        <Badge variant={episode.status === "completed" ? "default" : episode.status === "in-progress" ? "secondary" : "outline"} className="mt-1">
          {episode.status === "completed" ? "已完成" : episode.status === "in-progress" ? "制作中" : "草稿"}
        </Badge>
      }
    >

      {/* 新角色拦截提示 */}
      {newCharacters.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-500 flex items-center gap-2">
              <AlertCircle className="size-4" />
              发现 {newCharacters.length} 个新角色需要建立圣经
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {newCharacters.map((c) => (
              <div key={c.name} className="text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground text-xs">{c.description}</p>
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <Link href={`/projects/${projectId}/characters`}>
                <Button size="sm" variant="outline">前往角色库建立圣经</Button>
              </Link>
              <Button size="sm" onClick={handleResume} disabled={breakingDown}>
                {breakingDown ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                角色已就绪，继续写入
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 剧本输入 */}
      {episode.scenes.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">手动剧本入口（高级模式）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              推荐优先使用“故事工作台”完成 AI 大纲、主角锁定、角色确认和剧本正文生成。
              这里保留给需要直接粘贴剧本并手动拆解的高级用法。
            </div>
            <div className="space-y-1.5">
              <Label>剧本内容</Label>
              <Textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="粘贴本集剧本，AI 将自动拆解为场次、镜头、对白和视觉 Prompt…"
                rows={12}
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={handleBreakdown} disabled={breakingDown || !script.trim()}>
              {breakingDown ? <Loader2 className="size-4 animate-spin mr-2" /> : <Wand2 className="size-4 mr-2" />}
              {breakingDown ? "拆解中…" : "AI 拆解剧本"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 场次列表 */}
      {episode.scenes.length > 0 && (
        <div className="space-y-4">
          <SectionHeading
            eyebrow="场次"
            title={`${episode.scenes.length} 个场次`}
            description={`共 ${episode.scenes.flatMap((s) => s.shots).length} 个镜头。逐场进入镜头工作台继续生产。`}
          />
          {episode.scenes.map((scene) => (
            <Card key={scene.id} className="overflow-hidden">
              <CardHeader className="py-3 px-4 bg-muted/30 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">SC{scene.sceneOrder.toString().padStart(2, "0")}</span>
                    <span className="font-medium text-sm">{scene.location || "场次"}</span>
                    {scene.timeOfDay && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{scene.timeOfDay}</Badge>
                    )}
                  </div>
                  <Link href={`/projects/${projectId}/episodes/${epId}/scenes/${scene.id}`}>
                    <Button size="sm" variant="ghost" className="gap-1">
                      <Clapperboard className="size-3.5" />
                      镜头工作台
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </Link>
                </div>
                {scene.summary && <p className="text-xs text-muted-foreground mt-1">{scene.summary}</p>}
              </CardHeader>
              <CardContent className="p-0">
                {scene.shots.map((shot) => (
                  <div key={shot.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <span className="font-mono text-[10px] text-muted-foreground w-6 text-right shrink-0">
                      {shot.shotOrder}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{shot.shotType || "MS"}</Badge>
                    <p className="text-xs flex-1 min-w-0 truncate">{shot.actionDesc || shot.visualPrompt}</p>
                    {shot.dialogue && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        「{shot.dialogue.slice(0, 20)}」
                      </span>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      {shot.takes.filter((t) => t.takeType === "image").length > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">图</Badge>
                      )}
                      {shot.takes.filter((t) => t.takeType === "video").length > 0 && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">视频</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 情绪曲线编辑器 */}
      {episode.scenes.length > 1 && (
        <>
          <Separator />
          <section className="space-y-3">
            <SectionHeading
              eyebrow="节奏"
              title="情绪曲线"
              description="对各场次的情绪强度进行整体校准，保证叙事张力顺滑递进。"
            />
            <EmotionCurveEditor
              projectId={projectId}
              episodeId={epId}
              scenes={episode.scenes.map((s) => ({
                id: s.id,
                sceneOrder: s.sceneOrder,
                location: s.location,
                emotionArc: s.emotionArc ?? "",
              }))}
            />
          </section>
        </>
      )}

      <Separator />
      {/* 重新拆解 */}
      {episode.scenes.length > 0 && (
        <div className="space-y-3">
          <SectionHeading
            eyebrow="修订"
            title="重新拆解剧本"
            description="重新拆解将清空当前所有场次和镜头数据，已生成的 Take 仍会保留在文件系统中。"
          />
          <div className="space-y-2">
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="粘贴新版剧本…"
              rows={8}
              className="font-mono text-sm"
            />
            <Button variant="outline" onClick={handleBreakdown} disabled={breakingDown || !script.trim()}>
              {breakingDown ? <Loader2 className="size-4 animate-spin mr-2" /> : <Wand2 className="size-4 mr-2" />}
              重新拆解
            </Button>
          </div>
        </div>
      )}
    </ProjectPageShell>
  );
}
