"use client";

import { FileText, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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

interface ScriptSections {
  opening: string;
  scenePlan: string;
  dialogueMoments: string;
  fullText: string;
  endingHook: string;
}

interface EpisodeBeatLite {
  episode: string;
  beat: string;
  hook: string;
  cliffhanger: string;
}

interface StoryScriptPanelProps {
  episodes: EpisodeLite[];
  selectedEpisodeId: string;
  selectedEpisode: EpisodeLite | null;
  selectedEpisodeBeat: EpisodeBeatLite | null;
  sections: ScriptSections;
  rawValue: string;
  scriptReady: boolean;
  leadLocked: boolean;
  dialogueGuidance?: {
    hotZones: string[];
    blindSpots: string[];
  };
  voiceStyleHints?: string[];
  working: string | null;
  onEpisodeChange: (value: string) => void;
  onSectionChange: (field: keyof ScriptSections, value: string) => void;
  onRawChange: (value: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  onBreakdown: () => void;
}

export function StoryScriptPanel({
  episodes,
  selectedEpisodeId,
  selectedEpisode,
  selectedEpisodeBeat,
  sections,
  rawValue,
  scriptReady,
  leadLocked,
  dialogueGuidance,
  voiceStyleHints,
  working,
  onEpisodeChange,
  onSectionChange,
  onRawChange,
  onGenerate,
  onSave,
  onBreakdown,
}: StoryScriptPanelProps) {
  return (
    <Card id="script-section">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          3. 单集剧本正文
        </CardTitle>
        <CardDescription>
          先锁定主角，再让 AI 生成单集正文。这里保留全文编辑，也提供更适合产品化修稿的结构化视图。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label>选择剧集</Label>
            <Select value={selectedEpisodeId} onValueChange={(value) => onEpisodeChange(value ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="请选择剧集" />
              </SelectTrigger>
              <SelectContent>
                {episodes.map((episode) => (
                  <SelectItem key={episode.id} value={episode.id}>
                    {episode.title || `第 ${episode.episodeNum} 集`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-sm font-medium">{selectedEpisode?.title || "未选择剧集"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedEpisode?.summary || "先选定一集，再生成和确认该集的剧本正文。"}
            </p>
            {selectedEpisodeBeat ? (
              <div className="mt-3 rounded-xl border bg-background/80 p-3">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">来自大纲的本集节拍</p>
                <p className="mt-2 text-sm font-medium">{selectedEpisodeBeat.beat || "待补全节拍推进"}</p>
                <p className="mt-2 text-sm text-muted-foreground">Hook：{selectedEpisodeBeat.hook || "待补充"}</p>
                <p className="mt-1 text-sm text-muted-foreground">Cliffhanger：{selectedEpisodeBeat.cliffhanger || "待补充"}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">主角锁定</p>
            <p className="mt-2 text-sm font-medium">{leadLocked ? "已完成，可稳定写正文" : "未完成，仍应回到角色阶段"}</p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">当前稿状态</p>
            <p className="mt-2 text-sm font-medium">{scriptReady ? "已有确认稿，可继续拆解" : "仍需生成或人工补齐当前集正文"}</p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">下一阶段交接</p>
            <p className="mt-2 text-sm font-medium">拆解会直接读取当前确认稿，而不是重新猜剧情。</p>
          </div>
        </div>

        {dialogueGuidance && (dialogueGuidance.hotZones.length > 0 || dialogueGuidance.blindSpots.length > 0) ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-medium">角色台词与关系压力提示</p>
            {dialogueGuidance.hotZones.length > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                优先把这些冲突热区写进关键对白：{dialogueGuidance.hotZones.join(" / ")}
              </p>
            ) : null}
            {dialogueGuidance.blindSpots.length > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                这些角色关系仍偏空，台词容易同质化：{dialogueGuidance.blindSpots.join(" / ")}
              </p>
            ) : null}
            {voiceStyleHints && voiceStyleHints.length > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                建议强化的角色口吻：{voiceStyleHints.join(" / ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <Tabs defaultValue="structured" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="structured">结构化修稿</TabsTrigger>
            <TabsTrigger value="raw">全文原文</TabsTrigger>
          </TabsList>

          <TabsContent value="structured" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>开场钩子</Label>
                <Textarea value={sections.opening} onChange={(e) => onSectionChange("opening", e.target.value)} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>结尾悬点</Label>
                <Textarea value={sections.endingHook} onChange={(e) => onSectionChange("endingHook", e.target.value)} rows={3} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>场景推进提纲</Label>
              <Textarea value={sections.scenePlan} onChange={(e) => onSectionChange("scenePlan", e.target.value)} rows={5} />
            </div>
            <div className="space-y-1.5">
              <Label>关键对白与情绪节点</Label>
              <Textarea value={sections.dialogueMoments} onChange={(e) => onSectionChange("dialogueMoments", e.target.value)} rows={5} />
            </div>
            <div className="space-y-1.5">
              <Label>完整正文</Label>
              <Textarea value={sections.fullText} onChange={(e) => onSectionChange("fullText", e.target.value)} rows={12} className="leading-6" />
            </div>
          </TabsContent>

          <TabsContent value="raw" className="space-y-3">
            <Textarea value={rawValue} onChange={(e) => onRawChange(e.target.value)} rows={20} className="text-sm leading-6" />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onGenerate} disabled={working !== null || !leadLocked || !selectedEpisodeId}>
            {working === "script" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wand2 className="mr-2 size-4" />}
            AI 生成剧本
          </Button>
          <Button variant="outline" onClick={onSave} disabled={working !== null || !selectedEpisodeId}>
            保存当前剧本
          </Button>
          <Button variant="outline" onClick={onBreakdown} disabled={working !== null || !selectedEpisodeId || !scriptReady || !leadLocked}>
            {working === "breakdown" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            送入拆解
          </Button>
        </div>

        {!leadLocked ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
            还不能进入剧本阶段：请先在上一阶段锁定主角，避免 AI 在正文里漂移主视角和角色关系。
          </div>
        ) : null}

        {selectedEpisode ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border p-3">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Summary</p>
              <p className="mt-2 text-sm">{selectedEpisode.summary || "待补充"}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Hook</p>
              <p className="mt-2 text-sm">{selectedEpisode.hook || "待补充"}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Cliffhanger</p>
              <p className="mt-2 text-sm">{selectedEpisode.cliffhanger || "待补充"}</p>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
          <p className="text-sm font-medium">完成标准</p>
          <p className="mt-1 text-sm text-muted-foreground">
            当这集正文已经能明确支撑“开场抓人、场景推进、情绪节点、结尾悬点”四件事时，再把它送进拆解。这样下游分场景和镜头才不会漂。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
