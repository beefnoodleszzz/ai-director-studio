"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore, type ProjectData } from "@/stores/projectStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { Film, Plus, Clock, Clapperboard, Trash2, Loader2, Users } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { EmptyState } from "@/components/studio/EmptyState";
import { FormActionBar } from "@/components/studio/FormActionBar";

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "short-drama": "短剧",
  "manga-drama": "漫剧",
};

const ASPECT_LABELS: Record<string, string> = {
  "9:16": "9:16（竖屏）",
  "16:9": "16:9（横屏）",
};

function ProjectCard({ project, onDeleted }: { project: ProjectData; onDeleted: (id: string) => void }) {
  const router = useRouter();
  const { setCurrentProject } = useProjectStore();
  const [deleting, setDeleting] = useState(false);

  const completedEps = project.episodes?.filter((e) => e.productionStage === "production_ready").length ?? 0;
  const totalEps = project.episodes?.length ?? 0;
  const charCount = project.characters?.length ?? 0;

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

  const handleOpen = () => {
    setCurrentProject(project);
    router.push(`/projects/${project.id}`);
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
                  将永久删除「{project.title}」及其所有数据，此操作不可撤销。
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
        <CardTitle className="text-base leading-snug mt-2 cursor-pointer" onClick={handleOpen}>
          {project.title}
        </CardTitle>
        <CardDescription className="type-meta line-clamp-2 cursor-pointer" onClick={handleOpen}>
          {project.worldSetting || project.era || "暂无世界观描述"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 cursor-pointer" onClick={handleOpen}>
        <div className="flex items-center justify-between type-meta text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Clapperboard className="size-3" />
              <span>{totalEps} 集</span>
              {completedEps > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-1">
                  {completedEps} 完成
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Users className="size-3" />
              <span>{charCount} 角色</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            <span>{new Date(project.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            {project.type === "manga-drama" ? "漫剧" : "短剧"}
          </Badge>
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            {project.aspect ?? "9:16"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateProjectSheet({ onCreated }: { onCreated: (project: ProjectData) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("short-drama");
  const [aspect, setAspect] = useState("9:16");
  const [worldSetting, setWorldSetting] = useState("");
  const [era, setEra] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post<ProjectData>("/api/projects", {
        title,
        type,
        aspect,
        worldSetting,
        era,
      });
      onCreated(res.data);
      setOpen(false);
      setTitle("");
      setWorldSetting("");
      setEra("");
      toast.success("项目创建成功，请先完善风格圣经和角色圣经");
    } catch {
      toast.error("创建失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button className="gap-2" />}>
        <Plus className="size-4" />
        新建项目
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <SheetTitle className="text-lg flex items-center gap-2">
            <Film className="size-5 text-primary" />
            新建影视项目
          </SheetTitle>
          <SheetDescription>填写项目基本信息，完成后可继续补充风格圣经和角色圣经</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          <div className="space-y-1.5">
            <Label>项目名称 *</Label>
            <Input
              placeholder="如：《星际逃亡》第一季"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>项目类型</Label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger>
                  <SelectValue>{PROJECT_TYPE_LABELS[type] ?? type}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short-drama">短剧</SelectItem>
                  <SelectItem value="manga-drama">漫剧</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>默认画幅</Label>
              <Select value={aspect} onValueChange={(v) => v && setAspect(v)}>
                <SelectTrigger>
                  <SelectValue>{ASPECT_LABELS[aspect] ?? aspect}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16（竖屏）</SelectItem>
                  <SelectItem value="16:9">16:9（横屏）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>时代 / 地点</Label>
            <Input
              placeholder="如：现代都市 / 架空古代 / 未来科幻世界"
              value={era}
              onChange={(e) => setEra(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>世界观核心设定</Label>
            <Textarea
              placeholder="简述故事宇宙、核心矛盾、权力结构等（可后续在项目详情中补充完善）"
              value={worldSetting}
              onChange={(e) => setWorldSetting(e.target.value)}
              rows={5}
            />
          </div>
        </div>

        <SheetFooter className="p-0">
          <FormActionBar className="w-full justify-stretch">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button className="flex-1 gap-2" onClick={handleCreate} disabled={loading || !title.trim()}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {loading ? "创建中…" : "创建项目"}
            </Button>
          </FormActionBar>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
    <div className="app-page py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">影视项目</h1>
          <p className="text-sm text-muted-foreground mt-1">管理你的 AI 短剧 / 漫剧创作项目</p>
        </div>
        <CreateProjectSheet onCreated={handleCreated} />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="还没有项目"
          description="点击「新建项目」开始你的 AI 影视创作。"
          icon={Film}
          action={<CreateProjectSheet onCreated={handleCreated} />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
