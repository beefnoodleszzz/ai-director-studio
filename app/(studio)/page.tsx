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
import { Separator } from "@/components/ui/separator";
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
import { Film, Plus, ChevronRight, Clock, Clapperboard, Trash2, Sparkles, Loader2, Wand2 } from "lucide-react";
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

function CreateProjectSheet({ onCreated }: { onCreated: (project: ProjectData) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [globalLore, setGlobalLore] = useState("");
  const [generatingLore, setGeneratingLore] = useState(false);

  const handleGenerateLore = async () => {
    const source = idea.trim() || title.trim();
    if (!source) {
      toast.error("请先输入项目名称或一句话创意");
      return;
    }
    setGeneratingLore(true);
    try {
      const res = await axios.post<{ lore: string }>("/api/generate/lore", {
        idea: source,
      });
      setGlobalLore(res.data.lore);
      toast.success("世界观已生成，可直接编辑调整");
    } catch {
      toast.error("生成失败，请检查 DEEPSEEK_API_KEY 配置");
    } finally {
      setGeneratingLore(false);
    }
  };

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
      setIdea("");
      setGlobalLore("");
      toast.success("项目创建成功");
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

      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <SheetTitle className="text-lg flex items-center gap-2">
            <Film className="size-5 text-primary" />
            新建影视项目
          </SheetTitle>
          <SheetDescription>
            设定项目基本信息，AI 将为你生成完整的世界观提案
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {/* 项目名称 */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="title" className="text-sm font-medium">
              项目名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="如：《星际逃亡》第一季"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <Separator />

          {/* AI 世界观生成区 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">世界观设定</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  输入一句话创意，AI 自动生成完整世界观提案
                </p>
              </div>
            </div>

            {/* 一句话创意输入 */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="idea" className="text-xs text-muted-foreground">
                一句话创意（选填，留空则用项目名称生成）
              </Label>
              <div className="flex gap-2">
                <Input
                  id="idea"
                  placeholder="如：豪门复仇，女主被前男友背叛后逆袭..."
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleGenerateLore()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateLore}
                  disabled={generatingLore}
                  className="gap-1.5 shrink-0 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                >
                  {generatingLore ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="size-3.5" />
                  )}
                  {generatingLore ? "生成中..." : "AI 生成"}
                </Button>
              </div>
            </div>

            {/* 世界观编辑区 */}
            <div className="flex flex-col gap-1.5 relative">
              {generatingLore && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm rounded-lg">
                  <Sparkles className="size-6 text-primary animate-pulse" />
                  <p className="text-xs text-muted-foreground">正在生成世界观提案...</p>
                </div>
              )}
              <Textarea
                placeholder={`世界观将在这里展示，你可以直接编辑修改。\n\n也可以手动填写，例如：\n【故事宇宙】现代都市，豪门权贵...\n【核心矛盾】门不当户不对的爱情...\n【主角弧光】从平凡到蜕变...`}
                value={globalLore}
                onChange={(e) => setGlobalLore(e.target.value)}
                className="min-h-64 resize-none font-mono text-xs leading-relaxed"
              />
              {globalLore && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {globalLore.length} 字 · 可直接在上方编辑
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary"
                    onClick={handleGenerateLore}
                    disabled={generatingLore}
                  >
                    <Wand2 className="size-3" />
                    重新生成
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <SheetFooter className="px-6 pb-6 pt-4 border-t border-border/50 gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            取消
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleCreate}
            disabled={loading || !title.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <ChevronRight className="size-4" />
                创建项目
              </>
            )}
          </Button>
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">影视项目</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理你的 AI 短剧 / 漫剧创作项目
          </p>
        </div>
        <CreateProjectSheet onCreated={handleCreated} />
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="size-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center">
            <Film className="size-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">还没有项目</p>
            <p className="text-sm text-muted-foreground mt-1">
              点击「新建项目」开始你的 AI 影视创作
            </p>
          </div>
          <CreateProjectSheet onCreated={handleCreated} />
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
