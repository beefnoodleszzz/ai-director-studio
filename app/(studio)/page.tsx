"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore, type ProjectData } from "@/stores/projectStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Film, Plus, ChevronRight, Clock, Clapperboard, Trash2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

function ProjectCard({
  project,
  onDeleted,
}: {
  project: ProjectData;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const { setCurrentProject } = useProjectStore();
  const [deleting, setDeleting] = useState(false);

  const completedEps = project.episodes?.filter((e) => e.status === "completed").length ?? 0;
  const totalEps = project.episodes?.length ?? 0;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/api/projects/${project.id}`);
      onDeleted(project.id);
      toast.success(`「${project.title}」已删除`);
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="group relative hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Film className="size-5 text-primary" />
          </div>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <button className="opacity-0 group-hover:opacity-100 transition-opacity size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10" />
              }
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="size-3.5" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                <AlertDialogDescription>
                  将永久删除「{project.title}」及其所有集数、分镜、生成资产，此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-0"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "删除中..." : "确认删除"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <CardTitle
          className="text-base leading-snug mt-2 cursor-pointer"
          onClick={() => {
            setCurrentProject(project);
            router.push(`/projects/${project.id}`);
          }}
        >
          {project.title}
        </CardTitle>
        <CardDescription
          className="text-xs line-clamp-2 cursor-pointer"
          onClick={() => {
            setCurrentProject(project);
            router.push(`/projects/${project.id}`);
          }}
        >
          {project.globalLore || "无世界观描述"}
        </CardDescription>
      </CardHeader>
      <CardContent
        className="pt-0 cursor-pointer"
        onClick={() => {
          setCurrentProject(project);
          router.push(`/projects/${project.id}`);
        }}
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clapperboard className="size-3" />
            <span>{totalEps} 集</span>
            {completedEps > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                {completedEps} 完成
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            <span>{new Date(project.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateProjectDialog({ onCreated }: { onCreated: (project: ProjectData) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [globalLore, setGlobalLore] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post<ProjectData>("/api/projects", { title, globalLore });
      onCreated(res.data);
      setOpen(false);
      setTitle("");
      setGlobalLore("");
      toast.success("项目创建成功");
    } catch {
      toast.error("创建失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <Plus className="size-4" />
        新建项目
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建影视项目</DialogTitle>
          <DialogDescription>
            填写项目基本信息，世界观设定将贯穿整个创作流程
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">项目名称 *</Label>
            <Input
              id="title"
              placeholder="如：《星际逃亡》第一季"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lore">世界观设定</Label>
            <Textarea
              id="lore"
              placeholder="描述故事世界观、时代背景、核心冲突等..."
              value={globalLore}
              onChange={(e) => setGlobalLore(e.target.value)}
              className="min-h-24 resize-none"
            />
          </div>
          <Button onClick={handleCreate} disabled={loading} className="w-full">
            {loading ? "创建中..." : "创建项目"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { projects, setProjects, setCurrentProject } = useProjectStore();

  const handleCreated = (project: ProjectData) => {
    setProjects([project, ...projects]);
    setCurrentProject(project);
    router.push(`/projects/${project.id}`);
  };

  const handleDeleted = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">影视项目</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理你的 AI 短剧 / 漫剧创作项目
          </p>
        </div>
        <CreateProjectDialog onCreated={handleCreated} />
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="size-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center">
            <Film className="size-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">还没有项目</p>
            <p className="text-sm text-muted-foreground mt-1">点击「新建项目」开始你的 AI 影视创作</p>
          </div>
          <CreateProjectDialog onCreated={handleCreated} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
