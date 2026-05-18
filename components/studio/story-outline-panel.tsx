"use client";

import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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

interface StoryOutlinePanelProps {
  outline: StoryOutlineShape;
  rawValue: string;
  rawError: string | null;
  working: string | null;
  onGenerate: () => void;
  onSave: () => void;
  onRawChange: (value: string) => void;
  onFieldChange: (field: keyof StoryOutlineShape, value: string) => void;
  onCharacterChange: (index: number, field: keyof OutlineCharacter, value: string) => void;
  onBeatChange: (index: number, field: keyof EpisodeBeat, value: string) => void;
  onAddCharacter: () => void;
  onRemoveCharacter: (index: number) => void;
  onAddBeat: () => void;
  onRemoveBeat: (index: number) => void;
}

export function StoryOutlinePanel({
  outline,
  rawValue,
  rawError,
  working,
  onGenerate,
  onSave,
  onRawChange,
  onFieldChange,
  onCharacterChange,
  onBeatChange,
  onAddCharacter,
  onRemoveCharacter,
  onAddBeat,
  onRemoveBeat,
}: StoryOutlinePanelProps) {
  return (
    <Card id="outline-section">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          1. 剧情大纲
        </CardTitle>
        <CardDescription>
          先把故事方向和分集节拍定清楚，再进入角色和剧本。结构化视图适合产品化编辑，原始 JSON 视图保留给高级用户。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">角色骨架</p>
            <p className="mt-2 text-2xl font-semibold">{outline.outlineCharacters.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">先把大纲中的关键人物关系和出场功能定清楚。</p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">分集节拍</p>
            <p className="mt-2 text-2xl font-semibold">{outline.episodeBeats.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">每一集至少要有推进点、开场 hook 和结尾悬点。</p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">下一阶段交接</p>
            <p className="mt-2 text-sm font-medium">角色生成会优先消费这里的角色骨架与分集节拍。</p>
            <p className="mt-1 text-sm text-muted-foreground">大纲越清楚，后续主角锁定和单集正文漂移越少。</p>
          </div>
        </div>

        <Tabs defaultValue="structured" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="structured">结构化编辑</TabsTrigger>
            <TabsTrigger value="raw">原始 JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="structured" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>一句话梗概</Label>
                <Textarea
                  value={outline.logline}
                  onChange={(e) => onFieldChange("logline", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>主线冲突</Label>
                <Textarea
                  value={outline.coreConflict}
                  onChange={(e) => onFieldChange("coreConflict", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>主角目标</Label>
                <Textarea
                  value={outline.leadGoal}
                  onChange={(e) => onFieldChange("leadGoal", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>关键悬念</Label>
                <Textarea
                  value={outline.keySuspense}
                  onChange={(e) => onFieldChange("keySuspense", e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">主要角色草案</p>
                  <p className="text-sm text-muted-foreground">先把大纲里的角色骨架、关系火药味和剧情功能整理出来，下一阶段会正式生成角色设定。</p>
                </div>
                <Button variant="outline" size="sm" onClick={onAddCharacter}>
                  <Plus className="mr-2 size-4" />
                  新增角色条目
                </Button>
              </div>
              <div className="space-y-3">
                {outline.outlineCharacters.map((character, index) => (
                  <div key={`${character.name}-${index}`} className="rounded-2xl border p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <Input
                        value={character.name}
                        onChange={(e) => onCharacterChange(index, "name", e.target.value)}
                        placeholder="角色名"
                      />
                      <Input
                        value={character.role}
                        onChange={(e) => onCharacterChange(index, "role", e.target.value)}
                        placeholder="角色定位"
                      />
                      <Button variant="ghost" size="icon" onClick={() => onRemoveCharacter(index)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Textarea
                      className="mt-3"
                      value={character.hook}
                      onChange={(e) => onCharacterChange(index, "hook", e.target.value)}
                      placeholder="这个角色在大纲中的关键作用、关系张力、最容易爆的戏点"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">分集节拍</p>
                  <p className="text-sm text-muted-foreground">为后续单集剧本生成提供稳定的叙事骨架。</p>
                </div>
                <Button variant="outline" size="sm" onClick={onAddBeat}>
                  <Plus className="mr-2 size-4" />
                  新增一集节拍
                </Button>
              </div>
              <div className="space-y-3">
                {outline.episodeBeats.map((beat, index) => (
                  <div key={`${beat.episode}-${index}`} className="rounded-2xl border p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{beat.episode || `第 ${index + 1} 集`}</p>
                        <p className="text-xs text-muted-foreground">建议把这一集写成一个明确的推进单元，而不是泛泛剧情摘要。</p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto]">
                      <Input
                        value={beat.episode}
                        onChange={(e) => onBeatChange(index, "episode", e.target.value)}
                        placeholder="第几集"
                      />
                      <Input
                        value={beat.beat}
                        onChange={(e) => onBeatChange(index, "beat", e.target.value)}
                        placeholder="本集核心推进"
                      />
                      <Button variant="ghost" size="icon" onClick={() => onRemoveBeat(index)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Textarea
                        value={beat.hook}
                        onChange={(e) => onBeatChange(index, "hook", e.target.value)}
                        placeholder="开场 hook"
                        rows={2}
                      />
                      <Textarea
                        value={beat.cliffhanger}
                        onChange={(e) => onBeatChange(index, "cliffhanger", e.target.value)}
                        placeholder="结尾 cliffhanger"
                        rows={2}
                      />
                    </div>
                    <div className="rounded-xl border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                      交给下一阶段时，这一集至少要说清楚：主角在这集想要什么、遭遇什么阻力、靠什么 hook 把观众拉进来、用什么 cliffhanger 把观众留到下一集。
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="raw" className="space-y-3">
            <Textarea
              value={rawValue}
              onChange={(e) => onRawChange(e.target.value)}
              rows={18}
              className="font-mono text-sm"
            />
            {rawError ? <p className="text-sm text-destructive">{rawError}</p> : null}
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onGenerate} disabled={working !== null}>
            {working === "outline" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            AI 生成大纲
          </Button>
          <Button variant="outline" onClick={onSave} disabled={working !== null}>
            保存大纲
          </Button>
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
          <p className="text-sm font-medium">完成标准</p>
          <p className="mt-1 text-sm text-muted-foreground">
            当你能清楚回答“故事卖点是什么、主角想要什么、每一集靠什么推进和收尾”时，就可以把控制权交给下一阶段的角色生成与主角锁定。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
