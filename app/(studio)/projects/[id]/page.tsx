"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useProjectStore } from "@/stores/projectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Film,
  Users,
  BookOpen,
  Clapperboard,
  ListTodo,
  ShieldCheck,
  Download,
  Palette,
  ArrowRight,
  Plus,
  Loader2,
  BarChart2,
  FileText,
  UserCheck,
  LayoutDashboard,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";
import { SectionHeading } from "@/components/studio/SectionHeading";

interface ProjectDetail {
  id: string;
  title: string;
  type: string;
  aspect: string;
  platform: string;
  worldSetting: string;
  era: string;
  createdAt: string;
  styleBible: { id: string; genreTag: string; visualStyle: string } | null;
  characters: { id: string; name: string }[];
  episodes: {
    id: string;
    episodeNum: number;
    title: string;
    status: string;
    scenes: { id: string; shots: { id: string; status: string }[] }[];
  }[];
}

function NavCard({
  href,
  icon: Icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/40 transition-all duration-200 hover:shadow-md cursor-pointer h-full">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="type-body-strong">{title}</p>
              {badge && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {badge}
                </Badge>
              )}
            </div>
            <p className="type-meta text-muted-foreground mt-1">{description}</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { setCurrentProject } = useProjectStore();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingEp, setCreatingEp] = useState(false);

  useEffect(() => {
    axios
      .get<ProjectDetail>(`/api/projects/${id}`)
      .then((res) => {
        setProject(res.data);
        setCurrentProject(res.data as never);
      })
      .catch(() => toast.error("加载项目失败"))
      .finally(() => setLoading(false));
  }, [id, setCurrentProject]);

  const handleCreateEpisode = async () => {
    if (!project) return;
    setCreatingEp(true);
    try {
      const nextNum = (project.episodes?.length ?? 0) + 1;
      const res = await axios.post(`/api/projects/${id}/episodes`, {
        episodeNum: nextNum,
        title: `第 ${nextNum} 集`,
      });
      setProject((prev) =>
        prev ? { ...prev, episodes: [...(prev.episodes ?? []), res.data] } : prev
      );
      toast.success(`第 ${nextNum} 集已创建`);
    } catch {
      toast.error("创建失败");
    } finally {
      setCreatingEp(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="app-page py-10 text-center text-muted-foreground">项目不存在或已被删除</div>
    );
  }

  const totalShots = project.episodes?.flatMap((e) => e.scenes).flatMap((s) => s.shots).length ?? 0;
  const doneShots =
    project.episodes
      ?.flatMap((e) => e.scenes)
      .flatMap((s) => s.shots)
      .filter((sh) => sh.status === "video_done").length ?? 0;

  return (
    <ProjectPageShell
      title={project.title}
      description={project.worldSetting || "围绕角色、风格、剧集和镜头工作台，管理整个 AI 影视制作项目。"}
      backHref="/"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{project.type === "manga-drama" ? "漫剧" : "短剧"}</Badge>
        <Badge variant="outline">{project.aspect}</Badge>
        {project.era && <Badge variant="outline">{project.era}</Badge>}
        {project.styleBible?.genreTag && (
          <Badge variant="secondary">{project.styleBible.genreTag}</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 type-body">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Film className="size-4" />
            <span>{project.episodes?.length ?? 0} 集</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="size-4" />
            <span>{project.characters?.length ?? 0} 角色</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clapperboard className="size-4" />
            <span>{totalShots} 个镜头</span>
            {totalShots > 0 && (
              <span className="text-primary">
                （{doneShots}/{totalShots} 已生成）
              </span>
            )}
          </div>
      </div>

      <section className="space-y-4">
        <SectionHeading
          eyebrow="工作区"
          title="导演工作台"
          description="按制作流程进入角色、风格、剧集、任务、审片和导出模块。"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <NavCard
            href={`/projects/${id}/story`}
            icon={FileText}
            title="故事工作台"
            description="AI 生成大纲、主角、角色、剧本正文，并确认后进入拆解"
          />
          <NavCard
            href={`/projects/${id}/characters`}
            icon={Users}
            title="角色资产库"
            description="管理角色圣经、定妆资产、声音配置"
            badge={project.characters.length > 0 ? `${project.characters.length} 角色` : undefined}
          />
          <NavCard
            href={`/projects/${id}/style`}
            icon={Palette}
            title="风格圣经"
            description="定义视觉基调、镜头偏好、负面词库"
            badge={project.styleBible?.visualStyle ? "已配置" : "未配置"}
          />
          <NavCard
            href={`/projects/${id}/episodes`}
            icon={BookOpen}
            title="剧集管理"
            description="创建剧集、输入剧本、拆解场次和镜头"
            badge={project.episodes.length > 0 ? `${project.episodes.length} 集` : undefined}
          />
          <NavCard
            href={`/projects/${id}/tasks`}
            icon={ListTodo}
            title="任务中心"
            description="查看生成任务进度、断点恢复、取消任务"
          />
          <NavCard
            href={`/projects/${id}/qa`}
            icon={ShieldCheck}
            title="QA 审片"
            description="审查候选结果、指定采用、标记失败镜头"
          />
          <NavCard
            href={`/projects/${id}/export`}
            icon={Download}
            title="导出"
            description="合成短剧视频 · 导出漫剧竖版长图"
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          eyebrow="优化"
          title="质量飞轮"
          description="通过模板、基准、角色一致性和统计面板持续提升整条生成链路的稳定性。"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <NavCard
            href={`/projects/${id}/templates`}
            icon={FileText}
            title="Prompt 模板库"
            description="结构化 Prompt 模板，跨集复用，告别手写"
          />
          <NavCard
            href={`/projects/${id}/benchmark`}
            icon={BarChart2}
            title="Provider 基准"
            description="统计各 Provider 通过率、均分、耗时"
          />
          <NavCard
            href={`/projects/${id}/consistency`}
            icon={UserCheck}
            title="角色一致性"
            description="跨集角色稳定性报告，追踪漂移问题"
          />
          <NavCard
            href={`/projects/${id}/dashboard`}
            icon={LayoutDashboard}
            title="生产指标"
            description="废片率/可用率/任务统计/Provider对比看板"
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          eyebrow="内容"
          title="剧集列表"
          description="从这里进入每一集的剧本拆解、场次编排与镜头生产。"
          actions={
            <Button size="sm" variant="outline" onClick={handleCreateEpisode} disabled={creatingEp}>
              {creatingEp ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span className="ml-1.5">新建集数</span>
            </Button>
          }
        />

        {project.episodes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
              <BookOpen className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">还没有集数</p>
                <p className="type-meta text-muted-foreground mt-1">新建第一集，输入剧本开始创作</p>
              </div>
              <Button size="sm" onClick={handleCreateEpisode} disabled={creatingEp}>
                <Plus className="size-3.5 mr-1" />
                新建第一集
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {project.episodes.map((ep) => {
              const shots = ep.scenes.flatMap((s) => s.shots);
              const done = shots.filter((sh) => sh.status === "video_done").length;
              return (
                <Link key={ep.id} href={`/projects/${id}/episodes/${ep.id}`}>
                  <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded bg-muted flex items-center justify-center text-sm font-mono font-medium">
                            {ep.episodeNum}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{ep.title || `第 ${ep.episodeNum} 集`}</p>
                            <p className="type-meta text-muted-foreground">
                              {shots.length} 个镜头
                              {shots.length > 0 && ` · ${done} 已生成`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              ep.status === "completed"
                                ? "default"
                                : ep.status === "in-progress"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="text-xs"
                          >
                            {ep.status === "completed"
                              ? "已完成"
                              : ep.status === "in-progress"
                                ? "制作中"
                                : "草稿"}
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
      </section>
    </ProjectPageShell>
  );
}
