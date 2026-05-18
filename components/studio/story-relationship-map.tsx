"use client";

import { AlertTriangle, GitBranch, HeartHandshake, ShieldAlert, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

type RelationshipTone = "alliance" | "conflict" | "volatile";

interface RelationshipEdge {
  sourceId: string;
  targetId: string;
  tone: RelationshipTone;
  evidence: string;
}

const ALLIANCE_HINTS = ["盟友", "信任", "守护", "帮助", "合作", "爱", "依赖", "并肩", "支持"];
const CONFLICT_HINTS = ["敌", "对抗", "阻碍", "利用", "背叛", "报复", "控制", "压迫", "追杀", "仇"];
const VOLATILE_HINTS = ["暧昧", "摇摆", "怀疑", "秘密", "试探", "纠结", "复杂", "撕裂", "交易"];

function inferTone(summary: string, conflictRole: string): RelationshipTone {
  if (CONFLICT_HINTS.some((hint) => summary.includes(hint) || conflictRole.includes(hint))) return "conflict";
  if (VOLATILE_HINTS.some((hint) => summary.includes(hint))) return "volatile";
  if (ALLIANCE_HINTS.some((hint) => summary.includes(hint))) return "alliance";
  if (["反派", "阻碍者", "对手"].some((hint) => conflictRole.includes(hint))) return "conflict";
  if (["盟友", "助推", "搭档"].some((hint) => conflictRole.includes(hint))) return "alliance";
  return "volatile";
}

function toneStyles(tone: RelationshipTone) {
  if (tone === "alliance") {
    return {
      line: "rgba(14, 165, 233, 0.85)",
      chip: "border-sky-500/30 bg-sky-500/10 text-sky-800",
      label: "联盟/守护",
      icon: HeartHandshake,
    };
  }
  if (tone === "conflict") {
    return {
      line: "rgba(239, 68, 68, 0.9)",
      chip: "border-rose-500/30 bg-rose-500/10 text-rose-800",
      label: "冲突/压迫",
      icon: ShieldAlert,
    };
  }
  return {
    line: "rgba(245, 158, 11, 0.9)",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-900",
    label: "暧昧/不稳",
    icon: Sparkles,
  };
}

export function StoryRelationshipMap({
  characters,
  castDrafts,
  leadCharacterId,
}: {
  characters: CharacterLite[];
  castDrafts: Record<string, CharacterLite>;
  leadCharacterId: string;
}) {
  const mergedCharacters = characters.map((character) => ({
    ...character,
    ...castDrafts[character.id],
    relationshipSummary: castDrafts[character.id]?.relationshipSummary ?? character.relationshipSummary ?? "",
    arcSummary: castDrafts[character.id]?.arcSummary ?? character.arcSummary ?? "",
    dramaticGoal: castDrafts[character.id]?.dramaticGoal ?? character.dramaticGoal ?? "",
    conflictRole: castDrafts[character.id]?.conflictRole ?? character.conflictRole ?? "",
  }));

  const lead =
    mergedCharacters.find((character) => character.id === leadCharacterId) ??
    mergedCharacters.find((character) => character.isLead) ??
    null;
  const orbitCharacters = mergedCharacters.filter((character) => character.id !== lead?.id);

  const edges: RelationshipEdge[] = orbitCharacters
    .flatMap((character) => {
      const summary = character.relationshipSummary ?? "";
      const mentionedTargets = mergedCharacters.filter(
        (candidate) => candidate.id !== character.id && candidate.name && summary.includes(candidate.name)
      );

      if (mentionedTargets.length > 0) {
        return mentionedTargets.map((candidate) => ({
          sourceId: character.id,
          targetId: candidate.id,
          tone: inferTone(summary, character.conflictRole),
          evidence: summary,
        }));
      }

      if (lead) {
        return [
          {
            sourceId: character.id,
            targetId: lead.id,
            tone: inferTone(summary, character.conflictRole),
            evidence: summary || character.conflictRole || character.role,
          },
        ];
      }

      return [];
    })
    .filter(
      (edge, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.sourceId === edge.sourceId && candidate.targetId === edge.targetId && candidate.tone === edge.tone
        ) === index
    );

  const strongConflictNodes = orbitCharacters
    .filter((character) => inferTone(character.relationshipSummary ?? "", character.conflictRole) === "conflict")
    .slice(0, 3);

  const blindSpots = mergedCharacters.filter((character) => !character.relationshipSummary?.trim() || !character.arcSummary?.trim());
  const viewBoxWidth = 880;
  const viewBoxHeight = 320;
  const leadPosition = { x: 220, y: 160 };
  const orbitPositions = orbitCharacters.map((character, index) => {
    const y = 48 + index * (orbitCharacters.length > 1 ? 224 / Math.max(orbitCharacters.length - 1, 1) : 0);
    return {
      character,
      x: 640,
      y,
    };
  });
  const nodeMap = new Map<string, { x: number; y: number }>([
    ...(lead ? [[lead.id, leadPosition] as const] : []),
    ...orbitPositions.map((item) => [item.character.id, { x: item.x, y: item.y }] as const),
  ]);

  return (
    <div className="rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.1),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_34%)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-sky-700" />
            <p className="text-sm font-semibold">关系与冲突图层</p>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            用现有角色摘要快速看清“谁围绕主角转、谁制造压力、谁还缺关系定义”。这层不替代深度创作，但能立刻暴露故事关系网是否成立。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["alliance", "conflict", "volatile"] as const).map((tone) => {
            const style = toneStyles(tone);
            return (
              <Badge key={tone} variant="outline" className={style.chip}>
                {style.label}
              </Badge>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_320px]">
        <div className="overflow-hidden rounded-[24px] border bg-background/80 p-3">
          {mergedCharacters.length === 0 ? (
            <div className="flex min-h-[280px] items-center justify-center rounded-[18px] border border-dashed text-sm text-muted-foreground">
              先生成角色，关系图层才有内容可视化。
            </div>
          ) : (
            <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full">
              <defs>
                <linearGradient id="leadGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(14,165,233,0.95)" />
                  <stop offset="100%" stopColor="rgba(245,158,11,0.9)" />
                </linearGradient>
              </defs>

              {edges.map((edge) => {
                const source = nodeMap.get(edge.sourceId);
                const target = nodeMap.get(edge.targetId);
                if (!source || !target) return null;
                const style = toneStyles(edge.tone);
                return (
                  <path
                    key={`${edge.sourceId}-${edge.targetId}-${edge.tone}`}
                    d={`M ${source.x} ${source.y} C ${(source.x + target.x) / 2} ${source.y}, ${(source.x + target.x) / 2} ${target.y}, ${target.x} ${target.y}`}
                    fill="none"
                    stroke={style.line}
                    strokeWidth={edge.tone === "conflict" ? 4 : 3}
                    strokeDasharray={edge.tone === "volatile" ? "7 7" : undefined}
                    opacity={0.95}
                  />
                );
              })}

              {lead ? (
                <g>
                  <circle cx={leadPosition.x} cy={leadPosition.y} r="72" fill="url(#leadGlow)" opacity="0.18" />
                  <rect x={leadPosition.x - 92} y={leadPosition.y - 48} rx="26" width="184" height="96" fill="white" stroke="rgba(14,165,233,0.3)" />
                  <text x={leadPosition.x} y={leadPosition.y - 6} textAnchor="middle" className="fill-foreground text-[18px] font-semibold">
                    {lead.name}
                  </text>
                  <text x={leadPosition.x} y={leadPosition.y + 20} textAnchor="middle" className="fill-muted-foreground text-[12px]">
                    {lead.conflictRole || lead.role || "主角"}
                  </text>
                </g>
              ) : (
                <g>
                  <rect x={leadPosition.x - 92} y={leadPosition.y - 48} rx="26" width="184" height="96" fill="white" stroke="rgba(245,158,11,0.35)" />
                  <text x={leadPosition.x} y={leadPosition.y - 2} textAnchor="middle" className="fill-foreground text-[16px] font-semibold">
                    尚未锁定主角
                  </text>
                  <text x={leadPosition.x} y={leadPosition.y + 18} textAnchor="middle" className="fill-muted-foreground text-[12px]">
                    先指定唯一主角，关系图才会稳定
                  </text>
                </g>
              )}

              {orbitPositions.map(({ character, x, y }) => {
                const tone = inferTone(character.relationshipSummary ?? "", character.conflictRole);
                const style = toneStyles(tone);
                return (
                  <g key={character.id}>
                    <rect x={x - 124} y={y - 34} rx="22" width="248" height="68" fill="white" stroke={style.line} opacity="0.95" />
                    <text x={x - 104} y={y - 6} className="fill-foreground text-[15px] font-semibold">
                      {character.name}
                    </text>
                    <text x={x - 104} y={y + 16} className="fill-muted-foreground text-[11px]">
                      {(character.conflictRole || character.role || "角色").slice(0, 30)}
                    </text>
                    <text x={x + 102} y={y - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
                      {style.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[22px] border bg-background/85 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">冲突热区</p>
            <div className="mt-3 space-y-3">
              {strongConflictNodes.length > 0 ? (
                strongConflictNodes.map((character) => {
                  const style = toneStyles("conflict");
                  const Icon = style.icon;
                  return (
                    <div key={character.id} className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-rose-700" />
                        <p className="text-sm font-medium">{character.name}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{character.relationshipSummary || character.dramaticGoal || "当前还缺少更具体的冲突描述。"}</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">目前没有明显的强冲突角色。短剧会缺张力，建议至少明确一位持续施压者。</p>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border bg-background/85 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">关系盲区</p>
            <div className="mt-3 space-y-2">
              {blindSpots.length > 0 ? (
                blindSpots.map((character) => (
                  <div key={character.id} className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
                    <div>
                      <p className="text-sm font-medium">{character.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {!character.relationshipSummary?.trim() ? "缺关系摘要" : "缺成长弧线"}，后续剧本和拆解容易把这个角色写漂。
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">主要角色都具备关系摘要和弧线描述，可以继续推进剧本阶段。</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
