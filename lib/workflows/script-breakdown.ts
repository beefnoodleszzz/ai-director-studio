/**
 * 剧本拆解 Workflow
 *
 * 职责：
 * 1. 调用 LLM 将剧本拆解为 场次 → 镜头 结构
 * 2. 检测新重要角色，触发拦截（返回 NEED_CHARACTER_SETUP）
 * 3. 将场次/镜头写入数据库（Scene → Shot）
 * 4. 更新剧集摘要/hook/cliffhanger
 */

import { prisma } from "@/lib/prisma";
import {
  getDefaultProductionSpec,
  inferSceneDramaticTag,
} from "@/lib/genre-template";
import { recalculateEpisodeStage } from "@/lib/production-state";
import { enqueueTask } from "@/lib/task-queue";
import { callTextModel } from "@/lib/text-api";
import type { ScriptBreakdownResult, StoryOutlineResult } from "./types";

// ─── LLM 调用 ─────────────────────────────────────────────────────────────────

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  return callTextModel({
    systemPrompt,
    userPrompt,
    temperature: 0.45,
    maxOutputTokens: 5000,
    reasoningEffort: "high",
  });
}

// ─── LLM Prompt ───────────────────────────────────────────────────────────────

function buildSystemPrompt(existingCharNames: string, styleGuide?: string): string {
  return `你是顶级商业短剧分镜师与角色导演。请将用户提供的剧本拆解为场次和镜头，严格输出 JSON，不包含任何其他文字或 markdown 标记。

【已有角色库】：${existingCharNames || "（暂无）"}
${styleGuide ? `\n【视觉风格规范（每个 visualPrompt 必须严格遵守）】：\n${styleGuide}\n` : ""}
【JSON 格式】：
{
  "episodeSummary": "本集100字内摘要",
  "hook": "本集开场吸引点",
  "cliffhanger": "结尾悬念",
  "newCharacters": [
    { "name": "角色姓名", "description": "详细外貌+性格（中文）" }
  ],
  "scenes": [
    {
      "sceneOrder": 1,
      "location": "地点名称",
      "timeOfDay": "day|night|dawn|dusk",
      "timePeriod": "时间段描述",
      "characterNames": ["角色1", "角色2"],
      "plotPurpose": "场次剧情目的",
      "emotionArc": "情绪升级描述",
      "summary": "场次摘要",
      "shots": [
        {
          "shotOrder": 1,
          "shotType": "ECU|CU|MCU|MS|FS|LS|ELS",
          "cameraAngle": "eye|low|high|bird|dutch",
          "cameraMotion": "static|pan|tilt|dolly|handheld|zoom",
          "durationSecs": 3.0,
          "actionDesc": "行为描述（中文）",
          "narrativePurpose": "叙事目的",
          "emotionGoal": "情绪目标",
          "visualPrompt": "English cinematic prompt for image generation, detailed",
          "audioPrompt": "音效情绪标注[冷笑][雨声]",
          "dialogue": "角色台词原文"
        }
      ]
    }
  ]
}

提取新角色规则：
- 有名字、有台词、对剧情有推进作用 → 放入 newCharacters
- 路人甲、保安、服务员、群众 → 不提取，在 visualPrompt 中泛化描述

拆解要求强化：
- 这是 60 秒竖屏爆款短剧，不是常规影视分镜。全集总镜头数必须控制在 8-12 个，默认目标 10 个。
- 单场通常只允许 2-4 个镜头，只有极少数反杀/悬点场可到 5 个。
- 不要把一个动作拆成多个重复反应镜头；优先保留羞辱、压迫、反击、反应、悬点这些高价值镜头。
- 每个 shot 都必须承担明确功能标签，可理解为：hook-shot / pressure-shot / counter-shot / reaction-shot / cliff-shot 之一。
- 必须优先保持已确认主角为剧情视角核心，除非剧本文本明确要求切换。
- 每个 scene 的 plotPurpose 和 emotionArc 必须服务于本集 beat，而不是泛泛总结。
- 每个 shot 的 actionDesc / narrativePurpose / emotionGoal 必须具体到可拍可演可拆，不要抽象句。
- visualPrompt 必须体现角色关系、冲突压力和本镜头叙事目标。
- dialogue 必须保留人物辨识度，不要把所有角色说成同一种口气。`;
}

function scoreShotForCompression(
  shot: NonNullable<ScriptBreakdownResult["scenes"][number]["shots"]>[number],
  sceneIndex: number,
  shotIndex: number,
  totalScenes: number,
  shotsInScene: number
) {
  const haystack = `${shot.actionDesc} ${shot.narrativePurpose} ${shot.emotionGoal} ${shot.dialogue}`;
  let score = 0;

  if (sceneIndex === 0 && shotIndex === 0) score += 100;
  if (sceneIndex === totalScenes - 1 && shotIndex >= Math.max(0, shotsInScene - 2)) score += 90;
  if (/羞辱|踩|废|绝境|危机|代价/.test(haystack)) score += 50;
  if (/反击|反杀|锁喉|掐住|打脸|爆发/.test(haystack)) score += 60;
  if (/悬念|真相|异变|反噬|现身|倒计时|更深/.test(haystack)) score += 55;
  if (/惊愕|死静|众人|围观|反应/.test(haystack)) score += 25;
  if (/重复|再次|继续看着|只是/.test(haystack)) score -= 20;
  if ((shot.durationSecs ?? 3) > 6) score -= 10;

  return score;
}

function compressBreakdownToBudget(data: ScriptBreakdownResult) {
  const spec = getDefaultProductionSpec();
  const totalShots = data.scenes.reduce((sum, scene) => sum + (scene.shots?.length ?? 0), 0);
  if (totalShots <= spec.shotBudgetMax) return data;

  const totalScenes = data.scenes.length;
  const target = Math.max(spec.shotBudgetMin, Math.min(spec.shotBudgetMax, 10));

  const ranked = data.scenes.flatMap((scene, sceneIndex) => {
    const shots = scene.shots ?? [];
    return shots.map((shot, shotIndex) => ({
      sceneIndex,
      shotIndex,
      shot,
      score: scoreShotForCompression(shot, sceneIndex, shotIndex, totalScenes, shots.length),
    }));
  });

  const keep = new Set<string>();

  for (const scene of data.scenes) {
    const firstShot = scene.shots?.[0];
    if (firstShot) keep.add(firstShot.actionDesc + firstShot.dialogue + firstShot.narrativePurpose);
  }

  ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, target)
    .forEach((entry) => {
      keep.add(entry.shot.actionDesc + entry.shot.dialogue + entry.shot.narrativePurpose);
    });

  const compressedScenes = data.scenes
    .map((scene) => {
      const nextShots = (scene.shots ?? []).filter((shot) =>
        keep.has(shot.actionDesc + shot.dialogue + shot.narrativePurpose)
      );
      return {
        ...scene,
        shots: nextShots.map((shot, index) => ({
          ...shot,
          shotOrder: index + 1,
          durationSecs: Math.min(6, Math.max(3, shot.durationSecs ?? 3)),
        })),
      };
    })
    .filter((scene) => (scene.shots?.length ?? 0) > 0)
    .map((scene, sceneIndex) => ({
      ...scene,
      sceneOrder: sceneIndex + 1,
    }));

  return {
    ...data,
    scenes: compressedScenes,
  };
}

function summarizeRelationshipPressure(
  characters: Array<{
    name: string;
    conflictRole: string;
    relationshipSummary?: string;
    arcSummary?: string;
  }>
) {
  const hotZones = characters
    .filter((character) =>
      /(敌|对抗|压迫|背叛|控制|仇|阻碍|追杀)/.test(`${character.conflictRole}${character.relationshipSummary ?? ""}`)
    )
    .map((character) => `${character.name}: ${character.relationshipSummary || character.conflictRole}`)
    .slice(0, 4);

  const blindSpots = characters
    .filter((character) => !character.relationshipSummary?.trim() || !character.arcSummary?.trim())
    .map((character) => character.name)
    .slice(0, 4);

  return {
    hotZones,
    blindSpots,
  };
}

function selectRelevantCharactersForBreakdown(
  characters: Array<{
    name: string;
    isLead?: boolean;
    role: string;
    dramaticGoal: string;
    conflictRole: string;
    relationshipSummary?: string;
    arcSummary?: string;
    basePrompt?: string;
  }>,
  currentScript: string
) {
  const leadFirst = [...characters].sort((a, b) => Number(Boolean(b.isLead)) - Number(Boolean(a.isLead)));
  const explicitlyMentioned = leadFirst.filter((character) => currentScript.includes(character.name));
  const pool = explicitlyMentioned.length > 0 ? explicitlyMentioned : leadFirst;

  return pool
    .sort((a, b) => {
      const score = (item: typeof a) => {
        let total = 0;
        if (item.isLead) total += 100;
        if (/反派|主角|盟友|关键/.test(item.conflictRole)) total += 20;
        if (currentScript.includes(item.name)) total += 30;
        if (item.relationshipSummary?.trim()) total += 10;
        return total;
      };
      return score(b) - score(a);
    })
    .slice(0, 4);
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

export interface BreakdownScriptInput {
  projectId: string;
  episodeId: string;
  script: string;
}

export type BreakdownScriptResult =
  | { status: "NEED_CHARACTER_SETUP"; newCharacters: ScriptBreakdownResult["newCharacters"]; pendingData: ScriptBreakdownResult }
  | { status: "NEEDS_REVISION"; blockers: Array<{ code: string; title: string; detail: string }> }
  | { status: "SUCCESS"; sceneCount: number; shotCount: number };

function auditBreakdown(data: ScriptBreakdownResult) {
  const blockers: Array<{ code: string; title: string; detail: string }> = [];
  const spec = getDefaultProductionSpec();
  const shots = data.scenes.flatMap((scene) => scene.shots ?? []);

  if (shots.length < spec.shotBudgetMin || shots.length > spec.shotBudgetMax) {
    blockers.push({
      code: "shot-budget-out-of-range",
      title: "镜头预算不符合样板",
      detail: `当前拆解得到 ${shots.length} 个镜头，样板要求 ${spec.shotBudgetMin}-${spec.shotBudgetMax} 个镜头。`,
    });
  }

  const openingWindow = shots.slice(0, 2);
  const openingConflictRegex = /羞辱|危机|压迫|代价|逐出|废|humiliat|crisis|oppres|shame|bully|crush|stomp|mud|grind/i;
  if (!openingWindow.some((shot) => openingConflictRegex.test(`${shot.actionDesc}${shot.narrativePurpose}${shot.dialogue}${shot.visualPrompt}`))) {
    blockers.push({
      code: "weak-opening-conflict",
      title: "前段冲突进入太慢",
      detail: "前 2 个镜头必须让观众看见羞辱、危机或代价，而不是平铺背景。",
    });
  }

  const midShots = shots.slice(2, Math.max(2, shots.length - 2));
  const escalationRegex = /升级|反击|暴露|更糟|压迫|代价加重|反杀|escalat|counter|retaliat|reversal|seiz|choke|snap|burst|awaken|bone.*crack|crack.*bone/i;
  const escalationCount = midShots.filter((shot) =>
    escalationRegex.test(`${shot.narrativePurpose}${shot.emotionGoal}${shot.actionDesc}${shot.visualPrompt}`)
  ).length;
  if (escalationCount < spec.requiredEscalationCount) {
    blockers.push({
      code: "insufficient-escalation",
      title: "中段升级不足",
      detail: `当前中段只识别到 ${escalationCount} 次有效升级，样板至少要求 ${spec.requiredEscalationCount} 次。`,
    });
  }

  const tailShots = shots.slice(-2);
  const cliffRegex = /悬念|暴露|更高阶|追杀|异变|反噬|现身|cliff|suspense|reveal|mutation|awakening|ignit|burn|transform|sinister|mysterious|unknown|doom|deeper/i;
  if (!tailShots.some((shot) => cliffRegex.test(`${shot.narrativePurpose}${shot.emotionGoal}${shot.dialogue}${shot.visualPrompt}`))) {
    blockers.push({
      code: "missing-cliff-shot",
      title: "结尾悬点镜头不足",
      detail: "最后 1-2 个镜头必须承担明确悬点，而不是只做收尾说明。",
    });
  }

  return blockers;
}

export async function breakdownScript(input: BreakdownScriptInput): Promise<BreakdownScriptResult> {
  const { episodeId, script } = input;

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      project: {
        include: {
          characters: true,
          styleBible: true,
        },
      },
    },
  });
  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const outline = episode.project.storyOutline
    ? (JSON.parse(episode.project.storyOutline) as StoryOutlineResult)
    : null;
  const lead = episode.project.characters.find((character) => character.isLead) ?? null;

  const relevantCharacters = selectRelevantCharactersForBreakdown(episode.project.characters, script);
  const existingCharNames = relevantCharacters.map((c) => c.name).join("、");
  const characterList = relevantCharacters
    .map(
      (c) =>
        `- ${c.name}: role=${c.role}; isLead=${c.isLead ? "yes" : "no"}; goal=${c.dramaticGoal}; conflictRole=${c.conflictRole}; relationship=${c.relationshipSummary}; arc=${c.arcSummary}; visual=${c.basePrompt}`
    )
    .join("\n");
  const relationshipInsights = summarizeRelationshipPressure(relevantCharacters);

  const beat = outline?.episodeBeats?.find((item) => item.episodeNum === episode.episodeNum) ?? null;
  const outlineSummary = outline
    ? [
        `logline=${outline.logline}`,
        `coreConflict=${outline.coreConflict}`,
        `leadGoal=${outline.leadGoal}`,
        `toneAndSell=${outline.toneAndSell ?? ""}`,
        `villainPressure=${outline.villainPressure ?? ""}`,
        `suspenseBeats=${(outline.suspenseBeats ?? []).join(" / ")}`,
      ].join("\n")
    : "（暂无确认大纲）";

  const styleBible = episode.project.styleBible;
  const styleGuide = styleBible
    ? [
        styleBible.visualStyle ? `视觉流派：${styleBible.visualStyle}` : "",
        styleBible.colorStrategy ? `色彩策略：${styleBible.colorStrategy}` : "",
        styleBible.shotPreference ? `镜头偏好：${styleBible.shotPreference}` : "",
        styleBible.eraAesthetic ? `参考时代气质：${styleBible.eraAesthetic}` : "",
        styleBible.setConstraints ? `布景约束：${styleBible.setConstraints}` : "",
        styleBible.negativeKeywords
          ? `visualPrompt 中严禁出现以下元素：${styleBible.negativeKeywords}`
          : "",
        styleBible.genreTag ? `题材标签：${styleBible.genreTag}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const systemPrompt = buildSystemPrompt(existingCharNames, styleGuide || undefined);
  const userPrompt = [
    `世界观：${episode.project.worldSetting}`,
    `项目大纲约束：\n${outlineSummary}`,
    `主角：${lead ? `${lead.name} / ${lead.role} / goal=${lead.dramaticGoal} / relation=${lead.relationshipSummary}` : "（尚未锁定）"}`,
    `本集节拍：${beat ? `${beat.title} | beat=${beat.beat || beat.logline} | hook=${beat.hook} | cliffhanger=${beat.cliffhanger} | sceneGoal=${beat.sceneGoal ?? ""}` : "（暂无本集节拍）"}`,
    `关系冲突热区：${relationshipInsights.hotZones.join(" / ") || "未明确，拆解时必须主动维持主角的关系压力"}`,
    `关系盲区：${relationshipInsights.blindSpots.join(" / ") || "无明显盲区"}`,
    `已有角色：\n${characterList}`,
    `剧本来源：${episode.scriptSource || "manual"}`,
    `剧本正文：\n${script}`,
  ].join("\n\n");

  const raw = await callLLM(systemPrompt, userPrompt);
  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = compressBreakdownToBudget(JSON.parse(jsonStr) as ScriptBreakdownResult);

  if (!parsed.newCharacters) parsed.newCharacters = [];

  // 角色拦截
  if (parsed.newCharacters.length > 0) {
    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        summary: parsed.episodeSummary,
        hook: parsed.hook,
        cliffhanger: parsed.cliffhanger,
      },
    });
    await recalculateEpisodeStage(episodeId);
    return { status: "NEED_CHARACTER_SETUP", newCharacters: parsed.newCharacters, pendingData: parsed };
  }

  const blockers = auditBreakdown(parsed);
  if (blockers.length > 0) {
    return { status: "NEEDS_REVISION", blockers };
  }

  // 正式落库
  await commitScenesAndShots(episodeId, parsed);

  const totalShots = parsed.scenes.reduce((acc, s) => acc + (s.shots?.length ?? 0), 0);
  return { status: "SUCCESS", sceneCount: parsed.scenes.length, shotCount: totalShots };
}

// ─── 角色就绪后恢复落库 ───────────────────────────────────────────────────────

export async function commitPendingBreakdown(
  episodeId: string,
  pendingData: ScriptBreakdownResult
): Promise<{ sceneCount: number; shotCount: number }> {
  await commitScenesAndShots(episodeId, pendingData);
  const totalShots = pendingData.scenes.reduce((acc, s) => acc + (s.shots?.length ?? 0), 0);
  return { sceneCount: pendingData.scenes.length, shotCount: totalShots };
}

// ─── 内部：写场次和镜头 ───────────────────────────────────────────────────────

async function buildCharacterNameToIdMap(episodeId: string): Promise<Map<string, string>> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: { project: { select: { characters: { select: { id: true, name: true } } } } },
  });
  const map = new Map<string, string>();
  for (const character of episode?.project.characters ?? []) {
    map.set(character.name.trim().toLowerCase(), character.id);
  }
  return map;
}

function resolveSubjectCharIds(characterNames: string[], nameToIdMap: Map<string, string>): string {
  const ids = characterNames
    .map((name) => nameToIdMap.get(name.trim().toLowerCase()))
    .filter((id): id is string => Boolean(id));
  return JSON.stringify(ids);
}

async function commitScenesAndShots(episodeId: string, data: ScriptBreakdownResult) {
  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      summary: data.episodeSummary,
      hook: data.hook,
      cliffhanger: data.cliffhanger,
    },
  });

  // 清除旧场次（及其镜头，通过 cascade）
  await prisma.scene.deleteMany({ where: { episodeId } });

  // 角色名 → ID 映射，确保每个 Shot 都能注入正确的角色约束
  const nameToIdMap = await buildCharacterNameToIdMap(episodeId);

  const totalScenes = data.scenes.length;
  for (const [sceneIndex, sceneData] of data.scenes.entries()) {
    const sceneCharIds = resolveSubjectCharIds(sceneData.characterNames ?? [], nameToIdMap);

    const scene = await prisma.scene.create({
      data: {
        episodeId,
        sceneOrder: sceneData.sceneOrder,
        location: sceneData.location ?? "",
        timeOfDay: sceneData.timeOfDay ?? "",
        timePeriod: sceneData.timePeriod ?? "",
        characters: sceneCharIds,
        plotPurpose: sceneData.plotPurpose ?? "",
        emotionArc: sceneData.emotionArc ?? "",
        summary: sceneData.summary ?? "",
      },
    });

    if (sceneData.shots && sceneData.shots.length > 0) {
      for (const shotData of sceneData.shots) {
        await prisma.shot.create({
          data: {
            sceneId: scene.id,
            shotOrder: shotData.shotOrder,
            dramaticTag:
              shotData.dramaticTag ??
              inferSceneDramaticTag(
                {
                  sceneOrder: sceneData.sceneOrder,
                  location: sceneData.location ?? "",
                  objective: sceneData.plotPurpose ?? "",
                  conflict: sceneData.summary ?? "",
                  turningPoint: sceneData.emotionArc ?? "",
                  emotion: sceneData.emotionArc ?? "",
                  hookLine: sceneData.summary ?? "",
                  beatType: sceneData.plotPurpose ?? "",
                  dialogueIntent: "",
                  exitQuestion: sceneData.summary ?? "",
                },
                sceneIndex,
                totalScenes
              ),
            shotType: shotData.shotType ?? "",
            cameraAngle: shotData.cameraAngle ?? "",
            cameraMotion: shotData.cameraMotion ?? "",
            durationSecs: shotData.durationSecs ?? 3,
            subjectCharIds: sceneCharIds,
            actionDesc: shotData.actionDesc ?? "",
            narrativePurpose: shotData.narrativePurpose ?? "",
            emotionGoal: shotData.emotionGoal ?? "",
            visualPrompt: shotData.visualPrompt ?? "",
            audioPrompt: shotData.audioPrompt ?? "",
            dialogue: shotData.dialogue ?? "",
          },
        });
      }
    }
  }
  await recalculateEpisodeStage(episodeId);
}

// ─── 含任务追踪的包装入口 ─────────────────────────────────────────────────────

export async function breakdownScriptWithTask(input: BreakdownScriptInput): Promise<BreakdownScriptResult> {
  const { taskId, result } = await enqueueTask(
    {
      projectId: input.projectId,
      taskType: "script-breakdown",
      inputRef: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        script: input.script,
      },
    },
    () => breakdownScript(input)
  );
  void taskId;
  return result;
}

// ─── 下一集 seed ──────────────────────────────────────────────────────────────

export async function generateNextEpisodeSeed(
  projectId: string,
  prevEpisodeId: string
): Promise<string> {
  const episode = await prisma.episode.findUnique({
    where: { id: prevEpisodeId },
    include: { project: { include: { characters: true } } },
  });
  if (!episode) throw new Error("Episode not found");

  const characterList = episode.project.characters
    .map((c) => `- ${c.name}: ${c.basePrompt}`)
    .join("\n");

  return callLLM(
    "你是影视编剧助手，根据上一集摘要和角色设定，生成下一集的剧情走向提示（200字以内）。",
    `世界观：${episode.project.worldSetting}\n\n角色：\n${characterList}\n\n上一集摘要：${episode.summary}\n\n结尾悬念：${episode.cliffhanger}`
  );
}
