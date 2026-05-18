import axios from "axios";
import { prisma } from "@/lib/prisma";
import type {
  NewCharacterDraft,
  StoryCastGenerationResult,
  StoryCastCharacterResult,
  StoryScriptDialogueMoment,
  StoryScriptSceneCard,
  StoryOutlineCharacter,
  StoryOutlineResult,
  StoryScriptDraftResult,
} from "./types";

async function callLLM(systemPrompt: string, userPrompt: string, temperature = 0.7) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120_000,
    }
  );

  return response.data?.choices?.[0]?.message?.content as string;
}

function cleanJson(raw: string) {
  return raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

function extractJsonObject(raw: string) {
  const cleaned = cleanJson(raw);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function normalizeStoryOutline(parsed: StoryOutlineResult): StoryOutlineResult {
  const normalizedCharacters = Array.isArray(parsed.characters)
    ? parsed.characters.map((character, index) => ({
        name: character.name?.trim() || `角色${index + 1}`,
        role: character.role?.trim() || "关键角色",
        conflictRole: character.conflictRole?.trim() || (character.isLead ? "主角" : "关键配角"),
        dramaticGoal: character.dramaticGoal?.trim() || "推动当前主线冲突",
        relationshipSummary: character.relationshipSummary?.trim() || "",
        arcSummary: character.arcSummary?.trim() || "",
        visualDraft: character.visualDraft?.trim() || "外形鲜明、利于短剧辨识",
        voiceDraft: character.voiceDraft?.trim() || "说话节奏清晰，情绪有辨识度",
        hook:
          character.hook?.trim() ||
          character.dramaticGoal?.trim() ||
          `${character.name?.trim() || `角色${index + 1}`}带来关键戏剧变量`,
        isLead: Boolean(character.isLead) || index === 0,
      }))
    : [];

  const normalizedEpisodeBeats = Array.isArray(parsed.episodeBeats)
    ? parsed.episodeBeats.map((beat, index) => ({
        episode: beat.episode?.trim() || `第${beat.episodeNum || index + 1}集`,
        episodeNum: Number(beat.episodeNum) || index + 1,
        title: beat.title?.trim() || `第${index + 1}集`,
        beat: beat.beat?.trim() || beat.logline?.trim() || "推进主线并制造新的反转",
        logline: beat.logline?.trim() || beat.beat?.trim() || "本集推进主线冲突",
        hook: beat.hook?.trim() || "开场 30 秒出现强钩子和危机",
        cliffhanger: beat.cliffhanger?.trim() || "结尾留下必须追下一集的问题",
        escalation: beat.escalation?.trim() || "",
        emotionalShift: beat.emotionalShift?.trim() || "",
        sceneGoal: beat.sceneGoal?.trim() || "",
      }))
    : [];

  const suspenseBeats = Array.isArray(parsed.suspenseBeats)
    ? parsed.suspenseBeats.map((item) => item?.trim()).filter(Boolean)
    : [];

  return {
    logline: parsed.logline?.trim() || "",
    coreConflict: parsed.coreConflict?.trim() || "",
    leadGoal: parsed.leadGoal?.trim() || "",
    keySuspense:
      typeof parsed.keySuspense === "string"
        ? parsed.keySuspense.trim()
        : suspenseBeats.join("；"),
    suspenseBeats,
    toneAndSell: parsed.toneAndSell?.trim() || "",
    worldRules: parsed.worldRules?.trim() || "",
    villainPressure: parsed.villainPressure?.trim() || "",
    outlineCharacters: normalizedCharacters.map((character) => ({
      name: character.name,
      role: character.role,
      hook: character.hook || character.dramaticGoal,
    })),
    characters: normalizedCharacters,
    episodeBeats: normalizedEpisodeBeats,
  };
}

function normalizeCastResult(parsed: StoryCastGenerationResult, fallback: StoryOutlineCharacter[]) {
  const source = Array.isArray(parsed.characters) && parsed.characters.length > 0 ? parsed.characters : fallback;
  return source.map((character, index): StoryCastCharacterResult => {
    const visualDraft =
      "visualDraft" in character && typeof character.visualDraft === "string"
        ? character.visualDraft.trim()
        : "";
    const voiceDraft =
      "voiceDraft" in character && typeof character.voiceDraft === "string"
        ? character.voiceDraft.trim()
        : "";
    const dramaticGoal = character.dramaticGoal?.trim() || "围绕主线冲突采取行动";
    const role = character.role?.trim() || "关键角色";
    return {
      name: character.name?.trim() || `角色${index + 1}`,
      role,
      conflictRole: character.conflictRole?.trim() || (character.isLead ? "主角" : "关键配角"),
      dramaticGoal,
      relationshipSummary:
        "relationshipSummary" in character && typeof character.relationshipSummary === "string"
          ? character.relationshipSummary.trim()
          : "",
      arcSummary:
        "arcSummary" in character && typeof character.arcSummary === "string"
          ? character.arcSummary.trim()
          : dramaticGoal,
      visualDraft: visualDraft || "视觉识别度强，适合连续短剧呈现",
      voiceDraft: voiceDraft || "声线有辨识度，台词节奏利于短视频传播",
      basePrompt: [role, visualDraft, voiceDraft].filter(Boolean).join("；"),
      isLead: Boolean(character.isLead) || index === 0,
    };
  });
}

function normalizeScriptDraft(parsed: StoryScriptDraftResult) {
  const opening = parsed.opening?.trim() || "开场先用一个极短而强烈的异常抓住观众，并立刻抛出代价。";
  const sceneCards = Array.isArray(parsed.sceneCards)
    ? parsed.sceneCards.map((scene, index) => normalizeSceneCard(scene, index))
    : [];
  const scenePlan = Array.isArray(parsed.scenePlan)
    ? parsed.scenePlan
        .map((item, index) => normalizeScenePlanItem(item, sceneCards[index], index))
        .filter(Boolean)
    : sceneCards.map((scene) => formatScenePlanFromCard(scene));
  const dialogueMoments = Array.isArray(parsed.dialogueMoments)
    ? parsed.dialogueMoments
        .map((item, index) => normalizeDialogueMoment(item, sceneCards[index]))
        .filter(Boolean)
    : [];
  const fullText = parsed.fullText?.trim() || "";
  const endingHook = parsed.endingHook?.trim() || "结尾必须制造强追更欲望。";

  return {
    opening,
    scenePlan,
    dialogueMoments,
    fullText,
    endingHook,
    sceneCards,
  };
}

function normalizeSceneCard(scene: StoryScriptSceneCard, index: number) {
  return {
    sceneOrder: Number(scene.sceneOrder) || index + 1,
    location: scene.location?.trim() || "未指定场景",
    objective: scene.objective?.trim() || "推进主线并逼近代价",
    conflict: scene.conflict?.trim() || "人物对抗升级",
    turningPoint: scene.turningPoint?.trim() || "出现更糟的新变量",
    emotion: scene.emotion?.trim() || "情绪持续升级",
    hookLine: scene.hookLine?.trim() || "",
    beatType: scene.beatType?.trim() || "",
    dialogueIntent: scene.dialogueIntent?.trim() || "",
    exitQuestion: scene.exitQuestion?.trim() || "",
  };
}

function formatScenePlanFromCard(scene: ReturnType<typeof normalizeSceneCard>) {
  const fragments = [
    `场${scene.sceneOrder}｜${scene.location}`,
    `目标：${scene.objective}`,
    `冲突：${scene.conflict}`,
    `转折：${scene.turningPoint}`,
    scene.hookLine ? `开场钩子：${scene.hookLine}` : "",
    scene.exitQuestion ? `悬念落点：${scene.exitQuestion}` : "",
  ].filter(Boolean);
  return fragments.join("；");
}

function normalizeScenePlanItem(
  item: StoryScriptDraftResult["scenePlan"][number],
  fallbackCard: ReturnType<typeof normalizeSceneCard> | undefined,
  index: number
) {
  if (typeof item === "string") {
    return item.trim();
  }
  if (item && typeof item === "object") {
    return formatScenePlanFromCard(normalizeSceneCard(item as StoryScriptSceneCard, index));
  }
  if (fallbackCard) return formatScenePlanFromCard(fallbackCard);
  return "";
}

function normalizeDialogueMoment(
  item: StoryScriptDraftResult["dialogueMoments"][number],
  fallbackCard?: ReturnType<typeof normalizeSceneCard>
) {
  if (typeof item === "string") {
    return item.trim();
  }
  if (!item || typeof item !== "object") return "";
  const moment = item as StoryScriptDialogueMoment;
  const speaker = moment.speaker?.trim() || "角色";
  const line = moment.line?.trim() || "";
  if (!line) return "";
  const fragments = [
    `${speaker}${moment.target?.trim() ? ` -> ${moment.target.trim()}` : ""}：${line}`,
    moment.subtext?.trim() ? `潜台词：${moment.subtext.trim()}` : "",
    moment.beatPurpose?.trim()
      ? `作用：${moment.beatPurpose.trim()}`
      : fallbackCard?.dialogueIntent
        ? `作用：${fallbackCard.dialogueIntent}`
        : "",
    moment.emotion?.trim() ? `情绪：${moment.emotion.trim()}` : fallbackCard?.emotion ? `情绪：${fallbackCard.emotion}` : "",
    moment.escalation?.trim() ? `升级：${moment.escalation.trim()}` : "",
  ].filter(Boolean);
  return fragments.join("｜");
}

function composeScriptDraftText(structured: ReturnType<typeof normalizeScriptDraft>) {
  return [
    `## 开场钩子\n${structured.opening}`,
    `## 场景推进提纲\n${structured.scenePlan.join("\n")}`,
    `## 关键对白与情绪节点\n${structured.dialogueMoments.join("\n")}`,
    `## 完整正文\n${structured.fullText}`,
    `## 结尾悬点\n${structured.endingHook}`,
  ]
    .filter((block) => block.trim())
    .join("\n\n")
    .trim();
}

function summarizeRelationshipPressure(characters: Array<{
  name: string;
  conflictRole: string;
  relationshipSummary?: string;
  arcSummary?: string;
}>) {
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

const OUTLINE_SYSTEM_PROMPT = `你是世界级商业短剧总编剧，擅长生成适合 60-120 秒单集、强 hook、强反转、强追更欲望的短剧大纲。
请根据项目信息生成结构化剧情大纲，严格输出 JSON，不要输出 markdown，不要解释。

生成原则：
- 故事必须是短剧导向：开场快、冲突狠、人物目标明确、每集有强钩子和强 cliffhanger。
- 世界观和角色关系要服务于“连续追更”，不要空泛设定。
- 角色数量要克制，优先主角、反派、关键盟友/配角，保证后续镜头生成稳定。
- 每一集的 beat 都要能继续拆成场景和镜头，避免空泛抒情。
- 文本要具体、可拍、可演、可拆解。

严格输出 JSON，字段如下：
{
  "logline": "一句话故事核心",
  "coreConflict": "主线冲突",
  "leadGoal": "主角目标",
  "keySuspense": "整体追更悬念摘要，用一段话概括",
  "suspenseBeats": ["悬念1", "悬念2", "悬念3"],
  "toneAndSell": "本项目对观众的核心爽点/虐点/反差卖点",
  "worldRules": "世界观中真正会影响剧情推进的规则",
  "villainPressure": "反派或外部压力如何持续逼迫主角",
  "characters": [
    {
      "name": "角色名",
      "role": "身份/定位",
      "conflictRole": "主角|反派|盟友|关键配角",
      "dramaticGoal": "角色诉求",
      "relationshipSummary": "与主角及关键角色的关系和张力",
      "arcSummary": "这一季/这一阶段的功能弧线",
      "visualDraft": "外貌与气质草案",
      "voiceDraft": "声线与说话方式草案",
      "hook": "这个角色最吸引观众的一点",
      "isLead": true
    }
  ],
  "episodeBeats": [
    {
      "episodeNum": 1,
      "episode": "第1集",
      "title": "集标题",
      "beat": "本集核心推进",
      "logline": "本集一句话",
      "hook": "开场钩子",
      "cliffhanger": "结尾悬念",
      "escalation": "本集冲突如何升级",
      "emotionalShift": "主角情绪或关系的变化",
      "sceneGoal": "后续拆场景时最重要的戏剧目标"
    }
  ]
}`;

const CAST_SYSTEM_PROMPT = `你是世界级短剧角色设计师。请根据已经确认的大纲，生成一组更稳定、更利于后续剧本和镜头生产的核心角色设定。
要求：
- 严格输出 JSON，不要 markdown，不要解释。
- 角色数量要克制，优先 3-6 个真正推动剧情的人物。
- 每个角色都必须服务主线冲突，不能是空泛背景板。
- 设定要兼顾戏剧功能、视觉辨识度、台词声线辨识度，方便后续角色资产和镜头生成。

JSON 结构：
{
  "characters": [
    {
      "name": "角色名",
      "role": "身份/定位",
      "conflictRole": "主角|反派|盟友|关键配角",
      "dramaticGoal": "角色在前期最强烈的目标",
      "relationshipSummary": "与主角及关键人物的关系张力",
      "arcSummary": "阶段弧线或戏剧功能",
      "visualDraft": "可视化强、利于持续统一的外观和气质描述",
      "voiceDraft": "说话节奏、口头禅、声线特点",
      "basePrompt": "可直接服务后续资产生成的浓缩人物描述",
      "isLead": true
    }
  ]
}`;

const SCRIPT_SYSTEM_PROMPT = `你是世界级商业短剧编剧，擅长写适合分场景、分镜头、分情绪节点继续拆解的单集剧本。
请根据项目设定、确认后的角色和集大纲，输出单集剧本的结构化 JSON，不要 markdown，不要解释。

写作原则：
- 开场 10 秒内必须出现抓人的钩子、异常或即时代价，不能先铺垫世界观。
- 场景节奏必须快，每场戏都要完成“目标 -> 对抗 -> 转折 -> 留钩子”。
- 对白要短、准、狠，尽量一句一刀，少解释，多施压，多揭短，多制造关系变化。
- 每个场景都必须有明确目标、冲突、变化和离场问题，方便后续拆镜头。
- 结尾必须制造强烈的追更悬念，最好是新危机、身份反转、代价升级或关系决裂。
- 必须严格遵守已锁定主角、角色关系、角色目标，不要让配角抢走主线。
- 不要写空转安慰、礼貌寒暄、重复解释前情；信息要靠动作、对抗和台词推进。

JSON 结构：
{
  "opening": "开场钩子，1-3 句",
  "scenePlan": [
    {
      "sceneOrder": 1,
      "location": "场景地点",
      "objective": "本场目标",
      "conflict": "本场冲突",
      "turningPoint": "本场转折",
      "emotion": "本场情绪主导",
      "hookLine": "本场开头最抓人的一句或一个画面",
      "beatType": "压迫|试探|揭露|反杀|决裂|反转",
      "dialogueIntent": "这场对白主要要打出什么效果",
      "exitQuestion": "观众离开本场时最想知道什么"
    }
  ],
  "dialogueMoments": [
    {
      "speaker": "角色名",
      "target": "对白对象",
      "line": "一句最能传播、最能伤人或最能反转的台词",
      "subtext": "潜台词或压迫点",
      "beatPurpose": "推动关系/翻转信息/逼主角选择/制造羞辱/埋追更点",
      "emotion": "情绪状态",
      "escalation": "这句之后局势如何更糟"
    }
  ],
  "fullText": "完整中文剧本正文，按场景组织，包含场景名、动作和对白",
  "endingHook": "结尾悬点",
  "sceneCards": [
    {
      "sceneOrder": 1,
      "location": "场景地点",
      "objective": "本场目标",
      "conflict": "本场冲突",
      "turningPoint": "本场转折",
      "emotion": "本场情绪主导",
      "hookLine": "本场开头抓人信息",
      "beatType": "场景节拍类型",
      "dialogueIntent": "对白要完成的任务",
      "exitQuestion": "本场结束留给观众的问题"
    }
  ]
}`;

export async function generateProjectOutline(projectId: string): Promise<StoryOutlineResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { styleBible: true },
  });
  if (!project) throw new Error("Project not found");

  const userPrompt = [
    `项目标题：${project.title}`,
    `题材：${project.type}`,
    `平台：${project.platform || "短视频平台"}`,
    `世界观：${project.worldSetting}`,
    `时代：${project.era}`,
    `禁改规则：${project.forbidRules || "无"}`,
    `视觉风格：${project.styleBible?.visualStyle || "未指定"}`,
    `类型标签：${project.styleBible?.genreTag || "未指定"}`,
  ].join("\n");

  const raw = await callLLM(OUTLINE_SYSTEM_PROMPT, userPrompt, 0.55);
  const parsed = normalizeStoryOutline(JSON.parse(extractJsonObject(raw)) as StoryOutlineResult);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      storyOutline: JSON.stringify(parsed),
      productionStage: "outline_ready",
    },
  });

  return parsed;
}

export async function generateProjectCast(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  if (!project.storyOutline) throw new Error("Project outline is required before generating cast");

  const outline = normalizeStoryOutline(JSON.parse(project.storyOutline) as StoryOutlineResult);
  const userPrompt = [
    `项目标题：${project.title}`,
    `一句话梗概：${outline.logline}`,
    `主线冲突：${outline.coreConflict}`,
    `主角目标：${outline.leadGoal}`,
    `追更悬念：${outline.keySuspense}`,
    `角色草案：`,
    ...outline.characters.map(
      (character) =>
        `- ${character.name}: role=${character.role}; conflictRole=${character.conflictRole}; goal=${character.dramaticGoal}; relation=${character.relationshipSummary || "未补充"}; arc=${character.arcSummary || "未补充"}`
    ),
    `分集节拍：`,
    ...outline.episodeBeats.map(
      (beat) =>
        `- 第${beat.episodeNum}集 ${beat.title}: beat=${beat.beat || beat.logline}; hook=${beat.hook}; cliffhanger=${beat.cliffhanger}`
    ),
  ].join("\n");
  const castRaw = await callLLM(CAST_SYSTEM_PROMPT, userPrompt, 0.45);
  const generatedCharacters = normalizeCastResult(
    JSON.parse(extractJsonObject(castRaw)) as StoryCastGenerationResult,
    outline.characters
  );
  const createdCharacters: NewCharacterDraft[] = [];

  for (const character of generatedCharacters) {
    const existing = await prisma.characterBible.findFirst({
      where: { projectId, name: character.name },
    });
    if (existing) {
      await prisma.characterBible.update({
        where: { id: existing.id },
        data: {
          role: character.role,
          isLead: Boolean(character.isLead),
          dramaticGoal: character.dramaticGoal,
          conflictRole: character.conflictRole,
          relationshipSummary: character.relationshipSummary,
          arcSummary: character.arcSummary,
          basePrompt: character.basePrompt,
        },
      });
      continue;
    }

    await prisma.characterBible.create({
      data: {
        projectId,
        name: character.name,
        role: character.role,
        isLead: Boolean(character.isLead),
        dramaticGoal: character.dramaticGoal,
        conflictRole: character.conflictRole,
        relationshipSummary: character.relationshipSummary,
        arcSummary: character.arcSummary,
        basePrompt: character.basePrompt,
      },
    });

    createdCharacters.push({
      name: character.name,
      description: `${character.role}；${character.visualDraft}；${character.voiceDraft}；${character.relationshipSummary}`,
    });
  }

  return {
    createdCharacters,
    outlineCharacters: generatedCharacters,
  };
}

export async function lockProjectCast(projectId: string, leadCharacterId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { characters: true },
  });
  if (!project) throw new Error("Project not found");

  await prisma.characterBible.updateMany({
    where: { projectId },
    data: { isLead: false },
  });

  await prisma.characterBible.update({
    where: { id: leadCharacterId },
    data: { isLead: true },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { productionStage: "cast_locked" },
  });

  return { ok: true };
}

export async function generateEpisodeScript(projectId: string, episodeId: string) {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      project: {
        include: {
          characters: true,
        },
      },
    },
  });
  if (!episode || episode.projectId !== projectId) throw new Error("Episode not found");
  if (!episode.project.storyOutline) throw new Error("Project outline is required");

  const outline = normalizeStoryOutline(JSON.parse(episode.project.storyOutline) as StoryOutlineResult);
  const beat = outline.episodeBeats.find((item) => item.episodeNum === episode.episodeNum);
  const lead = episode.project.characters.find((character) => character.isLead);
  if (!lead) throw new Error("Lead character must be locked before generating script");

  const characterBlock = episode.project.characters
    .map((character) =>
      `- ${character.name}: role=${character.role}; goal=${character.dramaticGoal}; conflictRole=${character.conflictRole}; arc=${character.arcSummary}; visual=${character.basePrompt}`
    )
    .join("\n");
  const relationshipInsights = summarizeRelationshipPressure(episode.project.characters);

  const userPrompt = [
    `项目：${episode.project.title}`,
    `世界观：${episode.project.worldSetting}`,
    `主角：${lead.name} / ${lead.role} / ${lead.dramaticGoal}`,
    `主角当前最重要的关系压力：${lead.relationshipSummary || "关系压力未补充，但必须围绕主角当前目标制造拉扯"}`,
    `主角当前阶段弧线：${lead.arcSummary || "在不断加压中做出更危险的选择"}`,
    `整体主线冲突：${outline.coreConflict}`,
    `整体追更悬念：${outline.keySuspense}`,
    `整体卖点：${outline.toneAndSell || "强冲突、强反差、强追更欲望"}`,
    `反派/外部压力：${outline.villainPressure || "外部压力持续逼近主角并抬高代价"}`,
    `本集大纲：${beat ? `${beat.title} - ${beat.logline}` : episode.title}`,
    `本集核心推进：${beat?.beat || beat?.logline || episode.summary}`,
    `本集 hook：${beat?.hook || episode.hook}`,
    `本集 cliffhanger：${beat?.cliffhanger || episode.cliffhanger}`,
    `本集升级点：${beat?.escalation || "冲突持续升级并暴露新信息"}`,
    `本集情绪变化：${beat?.emotionalShift || "主角在压迫中做出更冒险的决定"}`,
    `本集拆解目标：${beat?.sceneGoal || "确保每场戏都可拆为清晰镜头"}`,
    `关系冲突热区：${relationshipInsights.hotZones.join(" / ") || "暂未提炼出明显热区，但必须围绕主角制造明确关系压力"}`,
    `关系盲区：${relationshipInsights.blindSpots.join(" / ") || "无明显盲区"}`,
    `对白要求：每场至少出现一句能单独成立的锋利台词；尽量避免解释性台词，优先用对抗、威胁、反问、羞辱、试探、反杀推进关系。`,
    `节奏要求：首场必须立即抛出危机或代价，中段至少两次升级，结尾必须把局面推向更坏。`,
    `角色列表：\n${characterBlock}`,
  ].join("\n\n");

  const raw = await callLLM(SCRIPT_SYSTEM_PROMPT, userPrompt, 0.45);
  const structured = normalizeScriptDraft(JSON.parse(extractJsonObject(raw)) as StoryScriptDraftResult);
  const scriptDraft = composeScriptDraftText(structured);

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      title: beat?.title || episode.title,
      hook: beat?.hook || episode.hook,
      cliffhanger: beat?.cliffhanger || episode.cliffhanger,
      summary: beat?.logline || episode.summary,
      scriptDraft,
      scriptSource: "generated",
      productionStage: "script_ready",
    },
  });

  return {
    title: beat?.title || episode.title,
    hook: beat?.hook || episode.hook,
    cliffhanger: beat?.cliffhanger || episode.cliffhanger,
    summary: beat?.logline || episode.summary,
    scriptDraft,
  };
}
