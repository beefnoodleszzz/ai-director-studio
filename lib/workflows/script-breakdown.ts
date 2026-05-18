/**
 * 剧本拆解 Workflow
 *
 * 职责：
 * 1. 调用 LLM 将剧本拆解为 场次 → 镜头 结构
 * 2. 检测新重要角色，触发拦截（返回 NEED_CHARACTER_SETUP）
 * 3. 将场次/镜头写入数据库（Scene → Shot）
 * 4. 更新剧集摘要/hook/cliffhanger
 */

import axios from "axios";
import { prisma } from "@/lib/prisma";
import { recalculateEpisodeStage } from "@/lib/production-state";
import { enqueueTask } from "@/lib/task-queue";
import type { ScriptBreakdownResult, StoryOutlineResult } from "./types";

// ─── LLM 调用 ─────────────────────────────────────────────────────────────────

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.7 },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120_000,
    }
  );

  return response.data.choices[0].message.content as string;
}

// ─── LLM Prompt ───────────────────────────────────────────────────────────────

function buildSystemPrompt(existingCharNames: string): string {
  return `你是顶级商业短剧分镜师与角色导演。请将用户提供的剧本拆解为场次和镜头，严格输出 JSON，不包含任何其他文字或 markdown 标记。

【已有角色库】：${existingCharNames || "（暂无）"}

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
- 必须优先保持已确认主角为剧情视角核心，除非剧本文本明确要求切换。
- 每个 scene 的 plotPurpose 和 emotionArc 必须服务于本集 beat，而不是泛泛总结。
- 每个 shot 的 actionDesc / narrativePurpose / emotionGoal 必须具体到可拍可演可拆，不要抽象句。
- visualPrompt 必须体现角色关系、冲突压力和本镜头叙事目标。
- dialogue 必须保留人物辨识度，不要把所有角色说成同一种口气。`;
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

// ─── 主入口 ───────────────────────────────────────────────────────────────────

export interface BreakdownScriptInput {
  projectId: string;
  episodeId: string;
  script: string;
}

export type BreakdownScriptResult =
  | { status: "NEED_CHARACTER_SETUP"; newCharacters: ScriptBreakdownResult["newCharacters"]; pendingData: ScriptBreakdownResult }
  | { status: "SUCCESS"; sceneCount: number; shotCount: number };

export async function breakdownScript(input: BreakdownScriptInput): Promise<BreakdownScriptResult> {
  const { episodeId, script } = input;

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      project: {
        include: { characters: true, styleBible: true },
      },
    },
  });
  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const outline = episode.project.storyOutline
    ? (JSON.parse(episode.project.storyOutline) as StoryOutlineResult)
    : null;
  const lead = episode.project.characters.find((character) => character.isLead) ?? null;

  const existingCharNames = episode.project.characters.map((c) => c.name).join("、");
  const characterList = episode.project.characters
    .map(
      (c) =>
        `- ${c.name}: role=${c.role}; isLead=${c.isLead ? "yes" : "no"}; goal=${c.dramaticGoal}; conflictRole=${c.conflictRole}; relationship=${c.relationshipSummary}; arc=${c.arcSummary}; visual=${c.basePrompt}`
    )
    .join("\n");
  const relationshipInsights = summarizeRelationshipPressure(episode.project.characters);

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

  const systemPrompt = buildSystemPrompt(existingCharNames);
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
  const parsed = JSON.parse(jsonStr) as ScriptBreakdownResult;

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

  for (const sceneData of data.scenes) {
    const scene = await prisma.scene.create({
      data: {
        episodeId,
        sceneOrder: sceneData.sceneOrder,
        location: sceneData.location ?? "",
        timeOfDay: sceneData.timeOfDay ?? "",
        timePeriod: sceneData.timePeriod ?? "",
        characters: JSON.stringify(sceneData.characterNames ?? []),
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
            shotType: shotData.shotType ?? "",
            cameraAngle: shotData.cameraAngle ?? "",
            cameraMotion: shotData.cameraMotion ?? "",
            durationSecs: shotData.durationSecs ?? 3,
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
