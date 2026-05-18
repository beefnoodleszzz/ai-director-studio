"use client";

import { use, useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StoryStageStrip } from "@/components/studio/story-stage-strip";
import { StoryBlockers } from "@/components/studio/story-blockers";
import { StoryCastPanel } from "@/components/studio/story-cast-panel";
import { StoryOutlinePanel } from "@/components/studio/story-outline-panel";
import { StoryScriptPanel } from "@/components/studio/story-script-panel";

interface CharacterLite {
  id: string;
  name: string;
  role: string;
  isLead: boolean;
  dramaticGoal: string;
  conflictRole: string;
  relationshipSummary?: string;
  arcSummary?: string;
  basePrompt?: string;
}

interface EpisodeLite {
  id: string;
  episodeNum: number;
  title: string;
  summary: string;
  hook: string;
  cliffhanger: string;
  scriptDraft?: string;
  productionStage?: string;
}

interface ProjectDetail {
  id: string;
  title: string;
  worldSetting: string;
  era: string;
  platform: string;
  forbidRules: string;
  productionStage: string;
  storyOutline: string;
  characters: CharacterLite[];
  episodes: EpisodeLite[];
}

interface StoryFeedback {
  relationshipBlindSpots: Array<{
    characterId: string;
    characterName: string;
    reason: string;
  }>;
  consistencyIssues: Array<{
    shotId: string;
    sceneOrder: number;
    episodeNum: number;
    shotOrder: number;
    tags: string[];
    details: string;
  }>;
  continuityIssues: Array<{
    shotId: string;
    sceneId?: string;
    shotOrder: number;
    tags: string[];
    recommendation: string;
  }>;
  rewriteSuggestions?: {
    cast?: string;
    script?: string;
    breakdown?: string;
  };
}

interface OutlineCharacter {
  name: string;
  role: string;
  hook: string;
}

interface EpisodeBeat {
  episode: string;
  beat: string;
  hook: string;
  cliffhanger: string;
}

interface StoryOutlineShape {
  logline: string;
  coreConflict: string;
  leadGoal: string;
  keySuspense: string;
  outlineCharacters: OutlineCharacter[];
  episodeBeats: EpisodeBeat[];
}

interface ScriptSections {
  opening: string;
  scenePlan: string;
  dialogueMoments: string;
  fullText: string;
  endingHook: string;
}

const EMPTY_OUTLINE: StoryOutlineShape = {
  logline: "",
  coreConflict: "",
  leadGoal: "",
  keySuspense: "",
  outlineCharacters: [],
  episodeBeats: [],
};

const SCRIPT_SECTION_LABELS = {
  opening: "开场钩子",
  scenePlan: "场景推进提纲",
  dialogueMoments: "关键对白与情绪节点",
  fullText: "完整正文",
  endingHook: "结尾悬点",
} as const;

function safeParseOutline(raw: string): StoryOutlineShape {
  if (!raw.trim()) return EMPTY_OUTLINE;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      logline: typeof parsed.logline === "string" ? parsed.logline : "",
      coreConflict: typeof parsed.coreConflict === "string" ? parsed.coreConflict : "",
      leadGoal: typeof parsed.leadGoal === "string" ? parsed.leadGoal : "",
      keySuspense: typeof parsed.keySuspense === "string" ? parsed.keySuspense : "",
      outlineCharacters: Array.isArray(parsed.outlineCharacters)
        ? parsed.outlineCharacters.map((item) => {
            const record = (item ?? {}) as Record<string, unknown>;
            return {
              name: typeof record.name === "string" ? record.name : "",
              role: typeof record.role === "string" ? record.role : "",
              hook: typeof record.hook === "string" ? record.hook : "",
            };
          })
        : [],
      episodeBeats: Array.isArray(parsed.episodeBeats)
        ? parsed.episodeBeats.map((item) => {
            const record = (item ?? {}) as Record<string, unknown>;
            return {
              episode: typeof record.episode === "string" ? record.episode : "",
              beat: typeof record.beat === "string" ? record.beat : "",
              hook: typeof record.hook === "string" ? record.hook : "",
              cliffhanger: typeof record.cliffhanger === "string" ? record.cliffhanger : "",
            };
          })
        : [],
    };
  } catch {
    return EMPTY_OUTLINE;
  }
}

function stringifyOutline(outline: StoryOutlineShape) {
  return JSON.stringify(outline, null, 2);
}

function parseScriptSections(text: string): ScriptSections {
  if (!text.trim()) {
    return {
      opening: "",
      scenePlan: "",
      dialogueMoments: "",
      fullText: "",
      endingHook: "",
    };
  }

  const headings = Object.values(SCRIPT_SECTION_LABELS);
  const hasStructuredHeading = headings.some((heading) => text.includes(`## ${heading}`));

  if (!hasStructuredHeading) {
    return {
      opening: "",
      scenePlan: "",
      dialogueMoments: "",
      fullText: text.trim(),
      endingHook: "",
    };
  }

  const sections: ScriptSections = {
    opening: "",
    scenePlan: "",
    dialogueMoments: "",
    fullText: "",
    endingHook: "",
  };

  let currentKey: keyof ScriptSections | null = null;
  const lines = text.split("\n");

  for (const line of lines) {
    const matchedKey = (Object.entries(SCRIPT_SECTION_LABELS) as Array<[keyof ScriptSections, string]>).find(
      ([, label]) => line.trim() === `## ${label}`
    )?.[0];
    if (matchedKey) {
      currentKey = matchedKey;
      continue;
    }
    if (currentKey) {
      sections[currentKey] += `${line}\n`;
    }
  }

  for (const key of Object.keys(sections) as Array<keyof ScriptSections>) {
    sections[key] = sections[key].trim();
  }

  return sections;
}

function composeScriptDraft(sections: ScriptSections) {
  return (Object.entries(SCRIPT_SECTION_LABELS) as Array<[keyof ScriptSections, string]>)
    .filter(([key]) => sections[key].trim())
    .map(([key, label]) => `## ${label}\n${sections[key].trim()}`)
    .join("\n\n")
    .trim();
}

export default function StoryWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const searchParams = useSearchParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [outlineDraft, setOutlineDraft] = useState("");
  const [scriptDraft, setScriptDraft] = useState("");
  const [leadCharacterId, setLeadCharacterId] = useState("");
  const [castDrafts, setCastDrafts] = useState<Record<string, CharacterLite>>({});
  const [pendingCharacters, setPendingCharacters] = useState<Array<{ name: string; description: string }>>([]);
  const [pendingBreakdownData, setPendingBreakdownData] = useState<unknown>(null);
  const [storyFeedback, setStoryFeedback] = useState<StoryFeedback | null>(null);
  const [scriptSections, setScriptSections] = useState<ScriptSections>({
    opening: "",
    scenePlan: "",
    dialogueMoments: "",
    fullText: "",
    endingHook: "",
  });

  const loadProject = async () => {
    const [projectRes, feedbackRes] = await Promise.all([
      axios.get<ProjectDetail>(`/api/projects/${projectId}`),
      axios.get<StoryFeedback>(`/api/projects/${projectId}/story-feedback`),
    ]);
    setProject(projectRes.data);
    setStoryFeedback(feedbackRes.data);
    setOutlineDraft(projectRes.data.storyOutline || "");
    if (projectRes.data.characters.some((character) => character.isLead)) {
      setLeadCharacterId(projectRes.data.characters.find((character) => character.isLead)?.id ?? "");
    }
    if (projectRes.data.episodes.length > 0) {
      const firstEpisode = projectRes.data.episodes[0];
      setSelectedEpisodeId((prev) => prev || firstEpisode.id);
      setScriptDraft(firstEpisode.scriptDraft || "");
    }
    setCastDrafts(
      Object.fromEntries(
        projectRes.data.characters.map((character) => [
          character.id,
          {
            ...character,
            relationshipSummary: character.relationshipSummary ?? "",
            arcSummary: character.arcSummary ?? "",
            basePrompt: character.basePrompt ?? "",
          },
        ])
      )
    );
  };

  useEffect(() => {
    loadProject()
      .catch(() => toast.error("加载故事工作台失败"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const selectedEpisode = useMemo(
    () => project?.episodes.find((episode) => episode.id === selectedEpisodeId) ?? null,
    [project, selectedEpisodeId]
  );

  const outline = useMemo(() => safeParseOutline(outlineDraft), [outlineDraft]);
  const selectedEpisodeBeat = useMemo(() => {
    if (!selectedEpisode) return null;
    const episodeLabel = [`第${selectedEpisode.episodeNum}集`, `第 ${selectedEpisode.episodeNum} 集`, String(selectedEpisode.episodeNum)];
    return (
      outline.episodeBeats.find((beat) => episodeLabel.includes(beat.episode.trim()) || beat.episode.trim() === selectedEpisode.title.trim()) ??
      null
    );
  }, [outline.episodeBeats, selectedEpisode]);
  const rawOutlineError = useMemo(() => {
    if (!outlineDraft.trim()) return null;
    try {
      JSON.parse(outlineDraft);
      return null;
    } catch {
      return "原始 JSON 目前不是合法格式。修复后才能保存。";
    }
  }, [outlineDraft]);

  const hasOutline = useMemo(
    () =>
      Boolean(
        outline.logline ||
          outline.coreConflict ||
          outline.leadGoal ||
          outline.keySuspense ||
          outline.outlineCharacters.length ||
          outline.episodeBeats.length
      ),
    [outline]
  );

  const hasLead = useMemo(
    () => Boolean(project?.characters.some((character) => character.isLead)),
    [project?.characters]
  );

  const hasScript = Boolean(scriptDraft.trim());
  const pendingCharacterNames = useMemo(() => {
    const raw = searchParams.get("pendingCharacters");
    if (!raw) return [];
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }, [searchParams]);
  const castNeedsAttention = searchParams.get("returnTo") === "cast" || pendingCharacterNames.length > 0;
  const relationshipGuidance = useMemo(() => {
    const hotZones = Object.values(castDrafts)
      .filter((character) =>
        /(敌|对抗|压迫|背叛|控制|仇|阻碍|追杀)/.test(`${character.conflictRole}${character.relationshipSummary ?? ""}`)
      )
      .map((character) => `${character.name}: ${character.relationshipSummary || character.conflictRole}`)
      .slice(0, 4);
    const blindSpots = Object.values(castDrafts)
      .filter((character) => !character.relationshipSummary?.trim() || !character.arcSummary?.trim())
      .map((character) => character.name)
      .slice(0, 4);
    return { hotZones, blindSpots };
  }, [castDrafts]);
  const voiceStyleHints = useMemo(
    () =>
      Object.values(castDrafts)
        .filter((character) => character.basePrompt?.trim())
        .slice(0, 4)
        .map((character) => `${character.name}: ${character.basePrompt?.split("；").slice(-1)[0] ?? "强化说话辨识度"}`),
    [castDrafts]
  );

  useEffect(() => {
    setScriptDraft(selectedEpisode?.scriptDraft || "");
  }, [selectedEpisode?.id, selectedEpisode?.scriptDraft]);

  useEffect(() => {
    setScriptSections(parseScriptSections(scriptDraft));
  }, [scriptDraft, selectedEpisode?.id]);

  const blockers = useMemo(() => {
    const items: Array<{ title: string; detail: string }> = [];
    if (!hasOutline) {
      items.push({
        title: "先确定剧情大纲",
        detail: "没有稳定的大纲时，后续角色和剧本会不断漂移，最终影响拆解和镜头一致性。",
      });
    }
    if (!hasLead) {
      items.push({
        title: "先锁定主角",
        detail: "主角没有明确锁定前，不应该进入剧本正文和拆解，否则 AI 会在主视角和角色关系上反复漂移。",
      });
    }
    if (!hasScript) {
      items.push({
        title: "先确认当前剧本正文",
        detail: "送入拆解前，至少需要有一版当前剧集的正文确认稿，才能稳定生成场次和镜头。",
      });
    }
    return items;
  }, [hasLead, hasOutline, hasScript]);

  const nextAction = useMemo(() => {
    if (!hasOutline) return { label: "先生成或补全剧情大纲", target: "outline-section" };
    if (!hasLead) return { label: "生成角色并锁定主角", target: "cast-section" };
    if (!hasScript) return { label: "生成当前剧集的剧本正文", target: "script-section" };
    return { label: "检查当前剧本后送入拆解", target: "script-section" };
  }, [hasLead, hasOutline, hasScript]);

  const updateOutline = (next: StoryOutlineShape) => {
    setOutlineDraft(stringifyOutline(next));
  };

  const updateOutlineField = (field: keyof StoryOutlineShape, value: string) => {
    updateOutline({ ...outline, [field]: value });
  };

  const updateOutlineCharacter = (index: number, field: keyof OutlineCharacter, value: string) => {
    const next = [...outline.outlineCharacters];
    next[index] = { ...next[index], [field]: value };
    updateOutline({ ...outline, outlineCharacters: next });
  };

  const updateEpisodeBeat = (index: number, field: keyof EpisodeBeat, value: string) => {
    const next = [...outline.episodeBeats];
    next[index] = { ...next[index], [field]: value };
    updateOutline({ ...outline, episodeBeats: next });
  };

  const handleStructuredScriptChange = (field: keyof ScriptSections, value: string) => {
    const next = { ...scriptSections, [field]: value };
    setScriptSections(next);
    setScriptDraft(composeScriptDraft(next));
  };

  const handleGenerateOutline = async () => {
    setWorking("outline");
    try {
      const res = await axios.post(`/api/projects/${projectId}/outline/generate`);
      setOutlineDraft(JSON.stringify(res.data, null, 2));
      await loadProject();
      toast.success("大纲生成完成");
    } catch {
      toast.error("大纲生成失败");
    } finally {
      setWorking(null);
    }
  };

  const handleSaveOutline = async () => {
    setWorking("save-outline");
    try {
      await axios.patch(`/api/projects/${projectId}/outline`, {
        storyOutline: outlineDraft ? JSON.parse(outlineDraft) : {},
      });
      await loadProject();
      toast.success("大纲已保存");
    } catch {
      toast.error("大纲保存失败，请检查 JSON 格式");
    } finally {
      setWorking(null);
    }
  };

  const handleGenerateCast = async () => {
    setWorking("cast");
    try {
      const res = await axios.post(`/api/projects/${projectId}/cast/generate`);
      if (res.data?.leadCharacterId) {
        setLeadCharacterId(res.data.leadCharacterId);
      }
      await loadProject();
      toast.success("角色生成完成");
    } catch {
      toast.error("角色生成失败");
    } finally {
      setWorking(null);
    }
  };

  const handleCastFieldChange = (characterId: string, field: keyof CharacterLite, value: string) => {
    setCastDrafts((prev) => ({
      ...prev,
      [characterId]: {
        ...prev[characterId],
        [field]: value,
      },
    }));
  };

  const handleSaveCast = async () => {
    if (!project) return;
    setWorking("save-cast");
    try {
      await axios.patch(`/api/projects/${projectId}/cast`, {
        leadCharacterId: leadCharacterId || undefined,
        characters: project.characters.map((character) => {
          const draft = castDrafts[character.id] ?? character;
          return {
            id: character.id,
            role: draft.role,
            dramaticGoal: draft.dramaticGoal,
            conflictRole: draft.conflictRole,
            relationshipSummary: draft.relationshipSummary ?? "",
            arcSummary: draft.arcSummary ?? "",
            basePrompt: draft.basePrompt ?? "",
            isLead: leadCharacterId === character.id,
          };
        }),
      });
      await loadProject();
      toast.success("角色确认已保存");
    } catch {
      toast.error("角色确认保存失败");
    } finally {
      setWorking(null);
    }
  };

  const handleLockLead = async () => {
    if (!leadCharacterId) {
      toast.error("请先选择主角");
      return;
    }
    setWorking("lock-cast");
    try {
      await axios.post(`/api/projects/${projectId}/cast/lock`, { leadCharacterId });
      await loadProject();
      toast.success("主角已锁定");
    } catch {
      toast.error("主角锁定失败");
    } finally {
      setWorking(null);
    }
  };

  const handleGenerateScript = async () => {
    if (!selectedEpisodeId) {
      toast.error("请先选择剧集");
      return;
    }
    setWorking("script");
    try {
      const res = await axios.post(`/api/projects/${projectId}/episodes/${selectedEpisodeId}/script/generate`);
      setScriptDraft(res.data.scriptDraft ?? "");
      await loadProject();
      toast.success("剧本正文生成完成");
    } catch {
      toast.error("剧本生成失败");
    } finally {
      setWorking(null);
    }
  };

  const handleSaveScript = async () => {
    if (!selectedEpisodeId) return;
    setWorking("save-script");
    try {
      await axios.patch(`/api/projects/${projectId}/episodes/${selectedEpisodeId}/script`, {
        scriptDraft,
        scriptSource: "manual",
        productionStage: "script_ready",
      });
      await loadProject();
      toast.success("剧本正文已保存");
    } catch {
      toast.error("剧本保存失败");
    } finally {
      setWorking(null);
    }
  };

  const handleBreakdown = async () => {
    if (!selectedEpisodeId || !scriptDraft.trim()) {
      toast.error("请先准备好剧本正文");
      return;
    }
    setWorking("breakdown");
    try {
      const res = await axios.post("/api/generate/script", {
        projectId,
        episodeId: selectedEpisodeId,
        script: scriptDraft,
        source: selectedEpisode?.scriptDraft ? "generated-script" : "manual-script",
      });
      if (res.data.status === "NEED_CHARACTER_SETUP") {
        setPendingCharacters(res.data.newCharacters ?? []);
        setPendingBreakdownData(res.data.pendingData ?? null);
        toast.warning(`拆解发现 ${res.data.newCharacters?.length ?? 0} 个新重要角色，请先确认角色后再继续`);
      } else {
        setPendingCharacters([]);
        setPendingBreakdownData(null);
        toast.success("剧本拆解任务已提交");
        await loadProject();
      }
    } catch {
      toast.error("剧本拆解失败");
    } finally {
      setWorking(null);
    }
  };

  const handleResumeBreakdown = async () => {
    if (!selectedEpisodeId || !pendingBreakdownData) {
      toast.error("没有待恢复的拆解数据");
      return;
    }
    setWorking("resume-breakdown");
    try {
      await axios.post("/api/generate/script", {
        projectId,
        episodeId: selectedEpisodeId,
        pendingData: pendingBreakdownData,
      });
      setPendingCharacters([]);
      setPendingBreakdownData(null);
      await loadProject();
      toast.success("角色确认后，拆解已继续执行");
    } catch {
      toast.error("恢复拆解失败");
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return <div className="app-page py-16 flex justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!project) {
    return <div className="app-page py-8 text-center text-muted-foreground">项目不存在</div>;
  }

  return (
    <ProjectPageShell
      title="故事工作台"
      description="把上游内容生产集中在一个地方完成：先定大纲，再锁主角，再确认剧本正文，最后才把内容送进拆解和镜头生产。"
      backHref={`/projects/${projectId}`}
      contentClassName="app-page-narrow"
      stickyHeader
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">当前阶段：{project.productionStage}</Badge>
          {hasLead ? <Badge variant="secondary">主角已锁定</Badge> : null}
        </div>
      }
    >
      <Card className="overflow-hidden border-none bg-gradient-to-br from-sky-500/12 via-background to-amber-500/10 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-5 text-sky-600" />
            AI 内容创作主流程
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            这里不是普通的“填几段文本然后拆解”。它是上游内容总控台，用来把故事方向、主角身份、单集正文这些关键决策先锁定，再把稳定输入送进后面的镜头生产系统。
          </p>
          <StoryStageStrip
            currentStage={project.productionStage}
            hasOutline={hasOutline}
            hasLead={hasLead}
            hasScript={hasScript}
          />
          <div className="flex flex-wrap gap-2">
            <Link href="./characters">
              <Button variant="outline">角色库</Button>
            </Link>
            <Link href="./episodes">
              <Button variant="outline">剧集执行层</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <StoryBlockers
        blockers={blockers}
        nextActionLabel={nextAction.label}
        nextActionTarget={nextAction.target}
        hasOutline={hasOutline}
        hasLead={hasLead}
        hasScript={hasScript}
      />

      {storyFeedback ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">下游质量反馈回流</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              这里汇总下游一致性、连续性与导出阶段反复出现的问题，帮助你判断哪些上游设定还不够稳。
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border p-4">
                <p className="text-sm font-medium">关系盲区</p>
                <p className="mt-2 text-2xl font-semibold">{storyFeedback.relationshipBlindSpots.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">角色关系或弧线还不够清晰。</p>
              </div>
              <div className="rounded-2xl border p-4">
                <p className="text-sm font-medium">角色一致性问题</p>
                <p className="mt-2 text-2xl font-semibold">{storyFeedback.consistencyIssues.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">可能来自角色设定、关系表达或视觉草案不足。</p>
              </div>
              <div className="rounded-2xl border p-4">
                <p className="text-sm font-medium">连续性问题</p>
                <p className="mt-2 text-2xl font-semibold">{storyFeedback.continuityIssues.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">说明节拍、情绪承接或镜头执行存在风险。</p>
              </div>
            </div>

            {storyFeedback.relationshipBlindSpots.length > 0 ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-medium">建议优先补齐这些角色的关系/弧线</p>
                {storyFeedback.rewriteSuggestions?.cast ? (
                  <p className="mt-1 text-sm text-muted-foreground">{storyFeedback.rewriteSuggestions.cast}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {storyFeedback.relationshipBlindSpots.slice(0, 6).map((item) => (
                    <Badge key={item.characterId} variant="outline">
                      {item.characterName} · {item.reason}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {storyFeedback.continuityIssues.length > 0 ? (
              <div className="rounded-2xl border p-4">
                <p className="text-sm font-medium">最近的连续性风险</p>
                {storyFeedback.rewriteSuggestions?.breakdown ? (
                  <p className="mt-1 text-sm text-muted-foreground">{storyFeedback.rewriteSuggestions.breakdown}</p>
                ) : null}
                <div className="mt-2 space-y-2">
                  {storyFeedback.continuityIssues.slice(0, 3).map((issue) => (
                    <div key={issue.shotId} className="rounded-xl border bg-background/80 px-3 py-2">
                      <p className="text-sm font-medium">镜头 #{issue.shotOrder}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{issue.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {storyFeedback.rewriteSuggestions?.script ? (
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
                <p className="text-sm font-medium">剧本层优化建议</p>
                <p className="mt-1 text-sm text-muted-foreground">{storyFeedback.rewriteSuggestions.script}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {pendingCharacters.length > 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">拆解发现新的重要角色</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingCharacters.map((character) => (
              <div key={character.name} className="rounded-xl border bg-background/80 px-3 py-2">
                <p className="font-medium">{character.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{character.description}</p>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Link href="./characters">
                <Button variant="outline">前往角色资产库深入编辑</Button>
              </Link>
              <Button onClick={handleResumeBreakdown} disabled={working !== null}>
                {working === "resume-breakdown" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                角色已确认，继续拆解
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <StoryOutlinePanel
        outline={outline}
        rawValue={outlineDraft}
        rawError={rawOutlineError}
        working={working}
        onGenerate={handleGenerateOutline}
        onSave={handleSaveOutline}
        onRawChange={setOutlineDraft}
        onFieldChange={updateOutlineField}
        onCharacterChange={updateOutlineCharacter}
        onBeatChange={updateEpisodeBeat}
        onAddCharacter={() =>
          updateOutline({
            ...outline,
            outlineCharacters: [...outline.outlineCharacters, { name: "", role: "", hook: "" }],
          })
        }
        onRemoveCharacter={(index) =>
          updateOutline({
            ...outline,
            outlineCharacters: outline.outlineCharacters.filter((_, itemIndex) => itemIndex !== index),
          })
        }
        onAddBeat={() =>
          updateOutline({
            ...outline,
            episodeBeats: [...outline.episodeBeats, { episode: "", beat: "", hook: "", cliffhanger: "" }],
          })
        }
        onRemoveBeat={(index) =>
          updateOutline({
            ...outline,
            episodeBeats: outline.episodeBeats.filter((_, itemIndex) => itemIndex !== index),
          })
        }
      />

      <StoryCastPanel
        characters={project.characters}
        castDrafts={castDrafts}
        leadCharacterId={leadCharacterId}
        working={working}
        castNeedsAttention={castNeedsAttention}
        pendingCharacterNames={pendingCharacterNames}
        pendingCharacters={pendingCharacters}
        onLeadChange={setLeadCharacterId}
        onGenerate={handleGenerateCast}
        onSave={handleSaveCast}
        onLockLead={handleLockLead}
        onFieldChange={handleCastFieldChange}
      />

      <StoryScriptPanel
        episodes={project.episodes}
        selectedEpisodeId={selectedEpisodeId}
        selectedEpisode={selectedEpisode}
        selectedEpisodeBeat={selectedEpisodeBeat}
        sections={scriptSections}
        rawValue={scriptDraft}
        scriptReady={hasScript}
        leadLocked={hasLead}
        dialogueGuidance={relationshipGuidance}
        voiceStyleHints={voiceStyleHints}
        working={working}
        onEpisodeChange={setSelectedEpisodeId}
        onSectionChange={handleStructuredScriptChange}
        onRawChange={setScriptDraft}
        onGenerate={handleGenerateScript}
        onSave={handleSaveScript}
        onBreakdown={handleBreakdown}
      />

      <Separator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">旧入口说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            你仍然可以去剧集页手动粘贴剧本后直接拆解，但那条路径现在更适合作为高级/手动入口，而不是默认主流程。
          </p>
          <Link href="./episodes">
            <Button variant="outline">前往剧集页手动处理</Button>
          </Link>
        </CardContent>
      </Card>
    </ProjectPageShell>
  );
}
