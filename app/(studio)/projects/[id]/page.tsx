"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore, type ProjectData, type EpisodeData } from "@/stores/projectStore";
import { StepWizard } from "@/components/studio/StepWizard";
import { CharacterCard, AddCharacterCard } from "@/components/studio/CharacterCard";
import { SceneCard } from "@/components/studio/SceneCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";
import axios from "axios";
import {
  Plus,
  Play,
  Film,
  Sparkles,
  ChevronRight,
  Download,
  Loader2,
  Trash2,
  Music,
  Volume2,
  Image,
  BookImage,
} from "lucide-react";
import { NewCharacterInterceptModal } from "@/components/studio/NewCharacterInterceptModal";
import type { NewCharacterDraft, SceneCard as SceneCardType } from "@/types";

type AspectRatio = "16:9" | "9:16";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    currentProject,
    currentEpisode,
    activeStep,
    setCurrentProject,
    setCurrentEpisode,
    setActiveStep,
    addCharacter,
    removeCharacter,
    updateCharacter,
    addEpisode,
    updateEpisode,
    replaceScenes,
    updateScene,
    setProjects,
    projects,
  } = useProjectStore();

  const [loading, setLoading] = useState(true);
  const [scriptInput, setScriptInput] = useState("");

  // 角色拦截状态机
  const [interceptOpen, setInterceptOpen] = useState(false);
  const [interceptNewChars, setInterceptNewChars] = useState<NewCharacterDraft[]>([]);
  const [pendingScenes, setPendingScenes] = useState<SceneCardType[]>([]);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingSfx, setGeneratingSfx] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [exportingManga, setExportingManga] = useState(false);
  const [assembledPath, setAssembledPath] = useState<string | null>(null);
  const [mangaPath, setMangaPath] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [nextEpSeed, setNextEpSeed] = useState<string>("");
  const [deletingEp, setDeletingEp] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  useEffect(() => {
    axios
      .get<ProjectData>(`/api/projects/${id}`)
      .then((res) => {
        setCurrentProject(res.data);
        if (res.data.episodes.length > 0) {
          setCurrentEpisode(res.data.episodes[res.data.episodes.length - 1]);
        }
        setLoading(false);
      })
      .catch(() => {
        toast.error("加载项目失败");
        setLoading(false);
      });
  }, [id, setCurrentProject, setCurrentEpisode]);

  const handleAddCharacter = async (data: {
    name: string;
    prompt: string;
    refImageUrl: string;
  }) => {
    try {
      const res = await axios.post(`/api/projects/${id}/characters`, data);
      addCharacter(res.data);
      toast.success(`角色「${data.name}」已添加`);
    } catch {
      toast.error("添加角色失败");
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    try {
      await axios.delete(`/api/projects/${id}/characters`, { data: { characterId } });
      removeCharacter(characterId);
      toast.success("角色已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleCreateEpisode = async () => {
    try {
      const res = await axios.post<EpisodeData>(`/api/projects/${id}/episodes`, {});
      addEpisode(res.data);
      setCurrentEpisode(res.data);
      setActiveStep(0);
      setAssembledPath(null);
      setMangaPath(null);
      toast.success(`第 ${res.data.episodeNum} 集已创建`);
    } catch {
      toast.error("创建集失败");
    }
  };

  const handleDeleteEpisode = async () => {
    if (!currentEpisode) return;
    setDeletingEp(true);
    try {
      await axios.delete(`/api/projects/${id}/episodes/${currentEpisode.id}`);
      const remaining = (currentProject?.episodes ?? []).filter(
        (e) => e.id !== currentEpisode.id
      );
      if (currentProject) {
        const updated = { ...currentProject, episodes: remaining };
        setCurrentProject(updated);
        setCurrentEpisode(remaining.length > 0 ? remaining[remaining.length - 1] : null);
      }
      setAssembledPath(null);
      setMangaPath(null);
      toast.success(`第 ${currentEpisode.episodeNum} 集已删除`);
    } catch {
      toast.error("删除集失败");
    } finally {
      setDeletingEp(false);
    }
  };

  const handleDeleteProject = async () => {
    setDeletingProject(true);
    try {
      await axios.delete(`/api/projects/${id}`);
      setCurrentProject(null);
      setCurrentEpisode(null);
      setProjects(projects.filter((p) => p.id !== id));
      toast.success("项目已删除");
      router.push("/");
    } catch {
      toast.error("删除项目失败");
    } finally {
      setDeletingProject(false);
    }
  };

  const handleBreakdownScript = async () => {
    if (!currentEpisode) { toast.error("请先创建一集"); return; }
    if (!scriptInput.trim()) { toast.error("请输入剧本内容"); return; }
    setGeneratingScript(true);
    try {
      const res = await axios.post<{
        status: "SUCCESS" | "NEED_CHARACTER_SETUP";
        scenes?: SceneCardType[];
        summary?: string;
        data?: {
          newCharacters: NewCharacterDraft[];
          pendingScenes: SceneCardType[];
          summary: string;
        };
      }>("/api/generate/script", {
        episodeId: currentEpisode.id,
        script: scriptInput,
      });

      if (res.data.status === "NEED_CHARACTER_SETUP" && res.data.data) {
        // 🚨 拦截：发现新角色，唤起弹窗
        const { newCharacters, pendingScenes: pending, summary } = res.data.data;
        setInterceptNewChars(newCharacters);
        setPendingScenes(pending);
        updateEpisode(currentEpisode.id, { summary });
        setInterceptOpen(true);
        toast.warning(
          `发现 ${newCharacters.length} 位新角色，请先建立视觉资产`,
          { duration: 5000 }
        );
      } else if (res.data.status === "SUCCESS") {
        // ✅ 无新角色，直接恢复
        const scenes = (res.data as any).scenes;
        replaceScenes(currentEpisode.id, scenes);
        updateEpisode(currentEpisode.id, { summary: (res.data as any).summary });
        toast.success(`拆解完成，共 ${scenes.length} 个分镜`);
        setActiveStep(2);
      }
    } catch {
      toast.error("剧本拆解失败，请检查 DEEPSEEK_API_KEY 配置");
    } finally {
      setGeneratingScript(false);
    }
  };

  /** 新角色全部入库后，释放拦截并批量写入分镜 */
  const handleInterceptDone = async (
    savedChars: { name: string; prompt: string; refImageUrl: string }[]
  ) => {
    if (!currentEpisode) return;
    setInterceptOpen(false);
    // 更新本地角色状态（CharacterData 无 projectId 字段）
    savedChars.forEach((c, i) =>
      addCharacter({ id: `new_${Date.now()}_${i}`, ...c })
    );
    try {
      const res = await axios.post("/api/scenes/batch-create", {
        episodeId: currentEpisode.id,
        scenes: pendingScenes,
      });
      replaceScenes(currentEpisode.id, res.data.scenes);
      toast.success(`分镜已恢复，共 ${res.data.scenes.length} 个镜头`);
      setActiveStep(2);
    } catch {
      toast.error("分镜写入失败，请重试");
    }
    setPendingScenes([]);
    setInterceptNewChars([]);
  };

  /** 用户选择跳过（不建立角色资产），直接用 pending 分镜落库 */
  const handleInterceptSkip = async () => {
    if (!currentEpisode) return;
    setInterceptOpen(false);
    try {
      const res = await axios.post("/api/scenes/batch-create", {
        episodeId: currentEpisode.id,
        scenes: pendingScenes,
      });
      replaceScenes(currentEpisode.id, res.data.scenes);
      toast.success(`已跳过角色建档，共 ${res.data.scenes.length} 个分镜`);
      setActiveStep(2);
    } catch {
      toast.error("分镜写入失败");
    }
    setPendingScenes([]);
    setInterceptNewChars([]);
  };

  const handleGenerateImages = async () => {
    if (!currentEpisode?.scenes.length) { toast.error("请先进行剧本拆解"); return; }
    setGeneratingImages(true);
    try {
      const res = await axios.post("/api/generate/image", { episodeId: currentEpisode.id });
      const results = res.data.results as Array<{ sceneId: string; localPath?: string }>;
      let ok = 0;
      results.forEach((r) => {
        if (r.localPath) {
          updateScene(r.sceneId, { localImage: r.localPath, status: "image_done" });
          ok++;
        }
      });
      toast.success(`${ok}/${results.length} 个首帧生成成功`);
      if (ok > 0) setActiveStep(3);
    } catch {
      toast.error("首帧生成失败");
    } finally {
      setGeneratingImages(false);
    }
  };

  const handleGenerateVideos = async () => {
    if (!currentEpisode) return;
    setGeneratingVideos(true);
    toast.info("视频生成中（含质检重试），请耐心等待...");
    try {
      const res = await axios.post("/api/generate/video", { episodeId: currentEpisode.id });
      const results = res.data.results as Array<{
        sceneId: string;
        localPath?: string;
        qa?: string;
        attempts?: number;
      }>;
      let ok = 0;
      results.forEach((r) => {
        if (r.localPath) {
          updateScene(r.sceneId, {
            localVideo: r.localPath,
            status: "video_done",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            qaStatus: r.qa === "pass" ? "pass" : "qa_failed",
          } as any);
          ok++;
        }
      });
      const degraded = results.filter((r) => r.qa === "degraded").length;
      toast.success(
        `${ok}/${results.length} 个视频生成完成${degraded > 0 ? `（${degraded} 个质检降级）` : ""}`
      );
    } catch {
      toast.error("视频生成失败");
    } finally {
      setGeneratingVideos(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!currentEpisode) return;
    setGeneratingAudio(true);
    try {
      const res = await axios.post("/api/generate/audio", { episodeId: currentEpisode.id });
      const results = res.data.results as Array<{
        sceneId: string;
        localPath?: string;
        skipped?: boolean;
      }>;
      const ok = results.filter((r) => r.localPath).length;
      results.forEach((r) => {
        if (r.localPath) updateScene(r.sceneId, { localAudio: r.localPath });
      });
      toast.success(`${ok} 个配音生成成功`);
    } catch {
      toast.error("配音生成失败");
    } finally {
      setGeneratingAudio(false);
    }
  };

  const handleGenerateSfx = async () => {
    if (!currentEpisode) return;
    setGeneratingSfx(true);
    try {
      const res = await axios.post("/api/generate/sfx", { episodeId: currentEpisode.id });
      const results = res.data.results as Array<{ sceneId: string; localPath?: string }>;
      const ok = results.filter((r) => r.localPath).length;
      results.forEach((r) => {
        if (r.localPath) updateScene(r.sceneId, { localSfx: r.localPath } as any);
      });
      toast.success(`${ok} 个环境音效生成成功`);
    } catch {
      toast.error("音效生成失败，请配置 SFX_API_KEY 或 TTS_API_KEY");
    } finally {
      setGeneratingSfx(false);
    }
  };

  const handleAssemble = async () => {
    if (!currentEpisode) return;
    setAssembling(true);
    try {
      const res = await axios.post("/api/generate/assemble", {
        episodeId: currentEpisode.id,
        aspect,
      });
      setAssembledPath(res.data.outputPath);
      updateEpisode(currentEpisode.id, { status: "completed" });
      toast.success("合成完成！");
      setActiveStep(5);
    } catch {
      toast.error("合成失败，请确认 FFmpeg 已安装");
    } finally {
      setAssembling(false);
    }
  };

  const handleExportManga = async () => {
    if (!currentEpisode) return;
    setExportingManga(true);
    try {
      const res = await axios.post("/api/export/manga", { episodeId: currentEpisode.id });
      setMangaPath(res.data.outputPath);
      toast.success("漫画长图导出成功！");
    } catch {
      toast.error("漫画导出失败");
    } finally {
      setExportingManga(false);
    }
  };

  const handleNextEpisodeSeed = async () => {
    if (!currentEpisode?.summary) { toast.error("当前集尚无摘要"); return; }
    try {
      const res = await axios.post("/api/generate/script", {
        episodeId: currentEpisode.id,
        script: `[续集种子请求] 上一集摘要: ${currentEpisode.summary}`,
      });
      setNextEpSeed(res.data.summary ?? "");
      toast.success("下一集剧情种子已生成");
    } catch {
      toast.error("生成失败");
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video" />
          ))}
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">项目未找到</p>
      </div>
    );
  }

  const scenes = currentEpisode?.scenes ?? [];
  const imagesDone = scenes.filter((s) => s.localImage).length;
  const videosDone = scenes.filter((s) => s.localVideo).length;
  const audioDone = scenes.filter((s) => s.localAudio).length;
  const sfxDone = scenes.filter((s) => (s as any).localSfx).length;
  const qaFailed = scenes.filter((s) => (s as any).qaStatus === "qa_failed").length;

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：项目信息 + 集切换 + 六步向导 */}
      <div className="p-4 border-b border-border/50 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{currentProject.title}</h2>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {currentProject.globalLore || "无世界观设定"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {currentProject.episodes
              .filter((e) => e.status !== "deleted")
              .map((ep) => (
                <Button
                  key={ep.id}
                  variant={currentEpisode?.id === ep.id ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setCurrentEpisode(ep);
                    setAssembledPath(null);
                    setMangaPath(null);
                  }}
                >
                  <Film className="size-3" />
                  第{ep.episodeNum}集
                  <Badge
                    variant={ep.status === "completed" ? "secondary" : "outline"}
                    className="text-[10px] px-1 py-0 ml-0.5"
                  >
                    {ep.status === "completed"
                      ? "✓"
                      : ep.status === "generating"
                        ? "…"
                        : "草稿"}
                  </Badge>
                </Button>
              ))}

            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={handleCreateEpisode}
            >
              <Plus className="size-3" />新集
            </Button>

            {currentEpisode && (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <button className="h-7 px-2 rounded-lg border border-border/50 flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors" />
                  }
                >
                  <Trash2 className="size-3" />删除集
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      删除第 {currentEpisode.episodeNum} 集？
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      将永久删除该集的所有分镜、首帧、视频和配音数据，此操作不可撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-0"
                      onClick={handleDeleteEpisode}
                      disabled={deletingEp}
                    >
                      {deletingEp ? "删除中..." : "确认删除"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <button className="h-7 px-2 rounded-lg border border-border/50 flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors" />
                }
              >
                <Trash2 className="size-3" />删除项目
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除整个项目？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将永久删除「{currentProject.title}
                    」及其所有集数、角色、分镜和生成资产，此操作不可撤销。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-0"
                    onClick={handleDeleteProject}
                    disabled={deletingProject}
                  >
                    {deletingProject ? "删除中..." : "确认删除项目"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <StepWizard
          activeStep={activeStep}
          completedSteps={[
            ...(currentProject.characters.length > 0 ? [0] : []),
            ...(scenes.length > 0 ? [1] : []),
            ...(imagesDone === scenes.length && scenes.length > 0 ? [2] : []),
            ...(videosDone === scenes.length && scenes.length > 0 ? [3] : []),
            ...(currentEpisode?.status === "completed" ? [4] : []),
          ]}
          onStepClick={setActiveStep}
        />
      </div>

      {/* 动态角色拦截弹窗 */}
      {interceptOpen && (
        <NewCharacterInterceptModal
          open={interceptOpen}
          projectId={id}
          newCharacters={interceptNewChars}
          onAllSaved={handleInterceptDone}
          onCancel={handleInterceptSkip}
        />
      )}

      <ScrollArea className="flex-1">
        <div className="p-6 flex flex-col gap-6">

          {/* Step 0: 世界观 & 角色 */}
          {activeStep === 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">世界观 & 数字演员库</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    上传定妆照作为 AI 一致性锚点，绑定所有后续画面
                  </p>
                </div>
                <Button size="sm" onClick={() => setActiveStep(1)} className="gap-1.5">
                  下一步 <ChevronRight className="size-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentProject.characters.map((char) => (
                  <CharacterCard
                    key={char.id}
                    character={char}
                    onDelete={handleDeleteCharacter}
                    onUpdate={updateCharacter}
                  />
                ))}
                <AddCharacterCard onAdd={handleAddCharacter} />
              </div>
            </div>
          )}

          {/* Step 1: 剧本拆解 */}
          {activeStep === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">剧本拆解</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    输入单集剧本，AI 自动拆解为 10~20 个分镜卡片（角色标签自动注入）
                  </p>
                </div>
              </div>

              {!currentEpisode ? (
                <Card className="border-dashed">
                  <CardContent className="p-6 flex flex-col items-center gap-3">
                    <p className="text-sm text-muted-foreground">请先创建一集</p>
                    <Button size="sm" onClick={handleCreateEpisode} className="gap-1.5">
                      <Plus className="size-3.5" />创建第一集
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  <Textarea
                    value={scriptInput}
                    onChange={(e) => setScriptInput(e.target.value)}
                    placeholder="在此粘贴剧本内容...（支持中文，建议每集 500~2000 字）"
                    className="min-h-48 font-mono text-sm resize-none"
                  />
                  <Button
                    onClick={handleBreakdownScript}
                    disabled={generatingScript || !scriptInput.trim()}
                    className="gap-2 self-end"
                  >
                    {generatingScript ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />拆解中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" />AI 拆解分镜
                      </>
                    )}
                  </Button>
                </div>
              )}

              {scenes.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">已拆解 {scenes.length} 个分镜</p>
                    <Button size="sm" onClick={() => setActiveStep(2)} className="gap-1.5">
                      前往首帧生成 <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {scenes.map((scene, i) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        index={i}
                        onPromptChange={(sceneId, prompt) =>
                          updateScene(sceneId, { visualPrompt: prompt })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: 首帧抽卡 */}
          {activeStep === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">首帧抽卡</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    并发生成各分镜首帧，可单张重抽到满意为止
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleGenerateImages}
                  disabled={generatingImages || scenes.length === 0}
                  className="gap-1.5"
                >
                  {generatingImages ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />批量生成首帧
                    </>
                  )}
                </Button>
              </div>

              {scenes.length > 0 && (
                <>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Progress
                      value={(imagesDone / scenes.length) * 100}
                      className="flex-1 h-1.5"
                    />
                    <span>{imagesDone}/{scenes.length} 完成</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {scenes.map((scene, i) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        index={i}
                        onRegenerateImage={(sceneId) => {
                          axios
                            .post("/api/generate/image", { sceneIds: [sceneId] })
                            .then(() => toast.success("重新生成中..."));
                        }}
                        onPromptChange={(sceneId, prompt) =>
                          updateScene(sceneId, { visualPrompt: prompt })
                        }
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: 视频 & 三轨音频 */}
          {activeStep === 3 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-semibold">动态引擎 & 三轨音频</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  图生视频（含质检重试）+ TTS 台词 + SFX 环境音效，三轨并行生成
                </p>
              </div>

              {/* QA 警告横幅 */}
              {qaFailed > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                  <span className="text-base">⚠️</span>
                  <span>
                    {qaFailed} 个分镜质检降级（系统已自动重试 3 次），可单独点击卡片重新生成
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 图生视频 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Film className="size-3.5 text-primary" />图生视频（I2V）
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Progress
                      value={(videosDone / Math.max(scenes.length, 1)) * 100}
                      className="h-1.5"
                    />
                    <p className="text-xs text-muted-foreground">
                      {videosDone}/{scenes.length} 完成
                      {qaFailed > 0 && (
                        <span className="ml-1 text-amber-400">({qaFailed} 质检降级)</span>
                      )}
                    </p>
                    <Button
                      size="sm"
                      onClick={handleGenerateVideos}
                      disabled={generatingVideos || imagesDone === 0}
                      className="gap-1.5 w-full"
                    >
                      {generatingVideos ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />生成中...
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5" />生成视频（含质检）
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* TTS 配音 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Volume2 className="size-3.5 text-primary" />TTS 台词配音
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Progress
                      value={(audioDone / Math.max(scenes.length, 1)) * 100}
                      className="h-1.5"
                    />
                    <p className="text-xs text-muted-foreground">
                      {audioDone}/{scenes.length} 完成
                    </p>
                    <Button
                      size="sm"
                      onClick={handleGenerateAudio}
                      disabled={generatingAudio}
                      className="gap-1.5 w-full"
                    >
                      {generatingAudio ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />生成中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />批量生成配音
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* SFX 环境音效 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Music className="size-3.5 text-primary" />SFX 环境音效
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Progress
                      value={(sfxDone / Math.max(scenes.length, 1)) * 100}
                      className="h-1.5"
                    />
                    <p className="text-xs text-muted-foreground">
                      {sfxDone}/{scenes.length} 完成
                    </p>
                    <Button
                      size="sm"
                      onClick={handleGenerateSfx}
                      disabled={generatingSfx}
                      variant="outline"
                      className="gap-1.5 w-full"
                    >
                      {generatingSfx ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />生成中...
                        </>
                      ) : (
                        <>
                          <Music className="size-3.5" />生成环境音效
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {scenes.map((scene, i) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    index={i}
                    onRegenerateVideo={(sceneId) => {
                      axios
                        .post("/api/generate/video", { sceneIds: [sceneId] })
                        .then(() => toast.success("视频重新生成中..."));
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 4: 时间线合成 & 多态导出 */}
          {activeStep === 4 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-semibold">时间线合成 & 多态导出</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  FFmpeg 智能对齐三轨音频，支持 16:9（横屏）/ 9:16（短剧竖屏）输出，一键导出漫剧长图
                </p>
              </div>

              {/* 资产统计 */}
              <Card>
                <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground font-medium">{imagesDone}/{scenes.length}</span>
                    <span>首帧</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground font-medium">{videosDone}/{scenes.length}</span>
                    <span>视频</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground font-medium">{audioDone}/{scenes.length}</span>
                    <span>TTS 配音</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground font-medium">{sfxDone}/{scenes.length}</span>
                    <span>SFX 音效</span>
                  </div>
                </CardContent>
              </Card>

              {/* 导出格式选择 */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">输出比例</p>
                <div className="flex gap-2">
                  {(["9:16", "16:9"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspect(r)}
                      className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border transition-colors ${
                        aspect === r
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      <div
                        className={`border-2 rounded-sm ${aspect === r ? "border-primary" : "border-muted-foreground"}`}
                        style={
                          r === "9:16"
                            ? { width: 18, height: 32 }
                            : { width: 32, height: 18 }
                        }
                      />
                      <span className="text-xs font-mono">{r}</span>
                      <span className="text-[10px] opacity-70">
                        {r === "9:16" ? "短剧/抖音" : "横屏/B站"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 操作按钮组 */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleAssemble}
                  disabled={
                    assembling ||
                    scenes.filter((s) => s.localVideo || s.localImage).length === 0
                  }
                  className="gap-2"
                >
                  {assembling ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />合成中...
                    </>
                  ) : (
                    <>
                      <Film className="size-4" />合成 MP4（{aspect}）
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleExportManga}
                  disabled={exportingManga || imagesDone === 0}
                  className="gap-2"
                >
                  {exportingManga ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />导出中...
                    </>
                  ) : (
                    <>
                      <BookImage className="size-4" />导出漫画长图
                    </>
                  )}
                </Button>
              </div>

              {/* 合成结果 */}
              {assembledPath && (
                <Card className="border-green-500/30 bg-green-500/5">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-500">
                        🎬 MP4 合成成功！
                      </p>
                      <p className="text-xs text-muted-foreground">{assembledPath}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      render={<a href={assembledPath} download />}
                    >
                      <Download className="size-3.5" />下载
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* 漫画导出结果 */}
              {mangaPath && (
                <Card className="border-purple-500/30 bg-purple-500/5">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-400">
                        🖼️ 漫画长图导出成功！
                      </p>
                      <p className="text-xs text-muted-foreground">{mangaPath}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        render={<a href={mangaPath} target="_blank" rel="noreferrer" />}
                      >
                        <Image className="size-3.5" />预览
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        render={<a href={mangaPath} download />}
                      >
                        <Download className="size-3.5" />下载
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 5: 续集传承 */}
          {activeStep === 5 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-semibold">续集传承机制</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  基于本集摘要 + 角色档案生成下一集剧情种子，保持人物样貌与剧情 100% 连贯
                </p>
              </div>

              {currentEpisode?.summary && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">本集剧情摘要</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{currentEpisode.summary}</p>
                  </CardContent>
                </Card>
              )}

              <Button onClick={handleNextEpisodeSeed} className="gap-2 self-start">
                <Sparkles className="size-4" />AI 生成下一集种子
              </Button>

              {nextEpSeed && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">下一集剧情走向</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{nextEpSeed}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
