"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, PencilLine, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StoryRelationshipMap } from "@/components/studio/story-relationship-map";

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

interface PendingCharacter {
  name: string;
  description: string;
}

interface StoryCastPanelProps {
  characters: CharacterLite[];
  castDrafts: Record<string, CharacterLite>;
  leadCharacterId: string;
  working: string | null;
  castNeedsAttention: boolean;
  pendingCharacterNames: string[];
  pendingCharacters: PendingCharacter[];
  onLeadChange: (value: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  onLockLead: () => void;
  onFieldChange: (characterId: string, field: keyof CharacterLite, value: string) => void;
}

export function StoryCastPanel({
  characters,
  castDrafts,
  leadCharacterId,
  working,
  castNeedsAttention,
  pendingCharacterNames,
  pendingCharacters,
  onLeadChange,
  onGenerate,
  onSave,
  onLockLead,
  onFieldChange,
}: StoryCastPanelProps) {
  return (
    <Card id="cast-section">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          2. 主角与角色确认
        </CardTitle>
        <CardDescription>
          这里决定故事由谁承载，也决定人物关系和成长弧线如何约束后续 AI 编剧。主角未锁定前，剧本正文和拆解都不应该继续。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {castNeedsAttention ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900">角色确认节点待处理</p>
                <p className="text-amber-800">
                  {pendingCharacterNames.length > 0
                    ? `拆解阶段识别到待确认的重要角色：${pendingCharacterNames.join("、")}。先把这些角色补进关系网，再继续后续剧本与拆解。`
                    : "当前流程已回到角色确认层。先处理主角、关系和角色弧线，再把内容交给剧本阶段。"}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onGenerate} disabled={working !== null}>
            {working === "cast" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            AI 生成角色
          </Button>
          <Button variant="outline" onClick={onSave} disabled={working !== null || characters.length === 0}>
            {working === "save-cast" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PencilLine className="mr-2 size-4" />}
            保存角色确认
          </Button>
          <Link href="./characters">
            <Button variant="outline">前往角色库深度编辑</Button>
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">角色规模</p>
            <p className="mt-2 text-2xl font-semibold">{characters.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">确保每个关键角色都有明确戏剧功能，而不是堆人名。</p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">主角状态</p>
            <p className="mt-2 text-sm font-medium">{characters.some((item) => item.isLead) ? "已锁定，可进入剧本阶段" : "未锁定，剧本与拆解应阻断"}</p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">下一阶段交接</p>
            <p className="mt-2 text-sm font-medium">剧本生成会直接消费这里的主角、关系摘要和成长弧线。</p>
          </div>
        </div>

        <StoryRelationshipMap characters={characters} castDrafts={castDrafts} leadCharacterId={leadCharacterId} />

        <div className="rounded-2xl border bg-muted/20 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-1.5">
              <Label>锁定唯一主角</Label>
              <Select value={leadCharacterId} onValueChange={(value) => onLeadChange(value ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择主角" />
                </SelectTrigger>
                <SelectContent>
                  {characters.map((character) => (
                    <SelectItem key={character.id} value={character.id}>
                      {character.name} · {character.role || "未定义"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={onLockLead} disabled={working !== null || !leadCharacterId}>
              {working === "lock-cast" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 size-4" />
              )}
              锁定主角
            </Button>
          </div>
        </div>

        {pendingCharacters.length > 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4">
            <p className="font-medium">待纳入关系网的重要角色</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {pendingCharacters.map((character) => (
                <div key={character.name} className="rounded-xl border bg-background/80 px-3 py-3">
                  <p className="font-medium text-sm">{character.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{character.description}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3">
          {characters.map((character) => (
            <div
              key={character.id}
              className={`rounded-2xl border p-4 ${
                leadCharacterId === character.id ? "border-primary/40 bg-primary/5" : "border-border/70"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{character.name}</span>
                  {character.isLead ? <Badge>已锁定主角</Badge> : null}
                  {leadCharacterId === character.id && !character.isLead ? <Badge variant="secondary">主角候选</Badge> : null}
                  <Badge variant="outline">
                    {castDrafts[character.id]?.conflictRole || character.conflictRole || character.role || "角色"}
                  </Badge>
                </div>
                <Link href="./characters">
                  <Button variant="ghost" size="sm" className="px-2 text-xs">
                    深入角色资产
                    <ArrowRight className="ml-1 size-3.5" />
                  </Button>
                </Link>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {castDrafts[character.id]?.dramaticGoal || character.dramaticGoal || character.role || "当前还没有足够的叙事目标描述。"}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`role-${character.id}`}>角色定位</Label>
                  <Input
                    id={`role-${character.id}`}
                    value={castDrafts[character.id]?.role ?? ""}
                    onChange={(e) => onFieldChange(character.id, "role", e.target.value)}
                    placeholder="例如：关键反派 / 冷面总裁 / 忠诚盟友"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`conflict-${character.id}`}>冲突角色</Label>
                  <Input
                    id={`conflict-${character.id}`}
                    value={castDrafts[character.id]?.conflictRole ?? ""}
                    onChange={(e) => onFieldChange(character.id, "conflictRole", e.target.value)}
                    placeholder="主角 / 反派 / 盟友 / 关键配角"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`goal-${character.id}`}>戏剧目标</Label>
                  <Textarea
                    id={`goal-${character.id}`}
                    value={castDrafts[character.id]?.dramaticGoal ?? ""}
                    onChange={(e) => onFieldChange(character.id, "dramaticGoal", e.target.value)}
                    rows={2}
                    placeholder="角色的核心诉求、行动驱动力和阶段目标"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`relationship-${character.id}`}>关系摘要</Label>
                  <Textarea
                    id={`relationship-${character.id}`}
                    value={castDrafts[character.id]?.relationshipSummary ?? ""}
                    onChange={(e) => onFieldChange(character.id, "relationshipSummary", e.target.value)}
                    rows={4}
                    placeholder="与主角和关键角色的关系、联盟和火药味"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`arc-${character.id}`}>成长弧线</Label>
                  <Textarea
                    id={`arc-${character.id}`}
                    value={castDrafts[character.id]?.arcSummary ?? ""}
                    onChange={(e) => onFieldChange(character.id, "arcSummary", e.target.value)}
                    rows={4}
                    placeholder="角色在剧情推进中的变化轨迹或功能弧线"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`prompt-${character.id}`}>AI 视觉/声音草案</Label>
                  <Textarea
                    id={`prompt-${character.id}`}
                    value={castDrafts[character.id]?.basePrompt ?? ""}
                    onChange={(e) => onFieldChange(character.id, "basePrompt", e.target.value)}
                    rows={3}
                    className="text-sm leading-6"
                    placeholder="保留 AI 角色草案中的外观、气质、声线信息，供后续角色资产与镜头生成使用"
                  />
                </div>
              </div>
            </div>
          ))}
          {characters.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              还没有角色结果。先基于当前大纲生成角色，再回来指定主角。
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
          <p className="text-sm font-medium">完成标准</p>
          <p className="mt-1 text-sm text-muted-foreground">
            当你能清楚回答“谁是主角、他想要什么、谁阻碍他、关键人物之间有什么关系张力、每个角色会怎样变化”时，就可以把控制权交给剧本正文阶段。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
