import type {
  ScriptContentMeta,
  StoryOutlineEpisodeBeat,
  StoryOutlineResult,
  StoryScriptDraftResult,
  StoryScriptSceneCard,
} from "@/lib/workflows/types";

export type ContentBlockerCode =
  | "missing-hook"
  | "missing-immediate-cost"
  | "insufficient-escalation"
  | "flat-escalation"
  | "unclear-lead-goal"
  | "weak-payoff"
  | "weak-cliffhanger"
  | "dialogue-too-expository"
  | "shot-budget-out-of-range"
  | "weak-opening-conflict"
  | "missing-cliff-shot";

export interface ContentBlocker {
  code: ContentBlockerCode;
  title: string;
  detail: string;
}

export interface ProductionSpec {
  episodeDurationTarget: number;
  shotBudgetMin: number;
  shotBudgetMax: number;
  hookDeadlineSecs: number;
  requiredEscalationCount: number;
  requiredEndingHook: boolean;
  requiredDialogueMainTrack: boolean;
  requireBgm: boolean;
  maxImageFallbackRatio: number;
  criticalDramaticTags: string[];
}

export const XIANXIA_REVENGE_PRODUCTION_SPEC: ProductionSpec = {
  episodeDurationTarget: 60,
  shotBudgetMin: 8,
  shotBudgetMax: 12,
  hookDeadlineSecs: 5,
  requiredEscalationCount: 2,
  requiredEndingHook: true,
  requiredDialogueMainTrack: true,
  requireBgm: true,
  maxImageFallbackRatio: 0.35,
  criticalDramaticTags: ["hook-shot", "counter-shot", "cliff-shot"],
};

export function getDefaultProductionSpec() {
  return XIANXIA_REVENGE_PRODUCTION_SPEC;
}

function normalizeText(value: string | undefined | null) {
  return value?.trim() ?? "";
}

export function ensureThreeEpisodeArc(beats: StoryOutlineEpisodeBeat[]) {
  const defaults = [
    {
      episodeNum: 1,
      title: "第1集·废柴受辱",
      beat: "羞辱与压制中抛出异变，主角第一次看到翻身可能。",
      logline: "废柴主角在众目睽睽下受辱，绝境中异变初现。",
      hook: "开场就是当众羞辱与生死代价。",
      cliffhanger: "主角发现体内异变，代价比机缘更可怕。",
      openingTrigger: "宗门试炼当场废掉主角，逼他认命退场。",
      pressureSource: "宗门天骄和长老公开碾压。",
      escalation: "羞辱升级为废功或逐出宗门，异变突然反噬。",
      emotionalShift: "从忍辱到第一次生出反杀念头。",
      sceneGoal: "用最短时间让观众看懂主角有多惨、敌人有多狠、异变有多危险。",
    },
    {
      episodeNum: 2,
      title: "第2集·试探反击",
      beat: "主角借新力量试探性反击，换来更高层的压制与觊觎。",
      logline: "主角刚尝到反击快感，就被更强权力锁定。",
      hook: "主角第一次反打成功，却立刻惹怒更大势力。",
      cliffhanger: "更高阶敌人看穿主角异常，决定亲自下场。",
      openingTrigger: "昨夜异变带来的力量第一次在众人面前失控暴露。",
      pressureSource: "宗门权力层与原反派联手施压。",
      escalation: "试探反击成功后，资源、身份、性命同时被盯上。",
      emotionalShift: "从试探自保变成必须主动出手。",
      sceneGoal: "证明主角不是偶然翻盘，而是真的开始动摇旧秩序。",
    },
    {
      episodeNum: 3,
      title: "第3集·公开打脸",
      beat: "主角首次公开反杀打脸，但真正的大敌也因此现身。",
      logline: "主角终于当众翻盘，却把自己送进更残酷的棋局。",
      hook: "公开场合，主角把羞辱原封不动还回去。",
      cliffhanger: "更高阶敌人现身，要么收编主角，要么亲手毁掉他。",
      openingTrigger: "反派想再踩主角一次，却被主角当场顶回去。",
      pressureSource: "更高阶敌人、宗门规则与围观舆论三重夹击。",
      escalation: "打脸成功后，主角反而暴露得更彻底。",
      emotionalShift: "从被动反击升级到主动宣战。",
      sceneGoal: "给观众明确 payoff，再立刻抬出更大悬念。",
    },
  ] satisfies StoryOutlineEpisodeBeat[];

  return defaults.map((item, index) => ({
    ...item,
    ...beats[index],
    episodeNum: item.episodeNum,
    episode: beats[index]?.episode?.trim() || `第${item.episodeNum}集`,
    title: normalizeText(beats[index]?.title) || item.title,
    beat: normalizeText(beats[index]?.beat) || item.beat,
    logline: normalizeText(beats[index]?.logline) || item.logline,
    hook: normalizeText(beats[index]?.hook) || item.hook,
    cliffhanger: normalizeText(beats[index]?.cliffhanger) || item.cliffhanger,
    openingTrigger: normalizeText(beats[index]?.openingTrigger) || item.openingTrigger,
    pressureSource: normalizeText(beats[index]?.pressureSource) || item.pressureSource,
    escalation: normalizeText(beats[index]?.escalation) || item.escalation,
    emotionalShift: normalizeText(beats[index]?.emotionalShift) || item.emotionalShift,
    sceneGoal: normalizeText(beats[index]?.sceneGoal) || item.sceneGoal,
  }));
}

export function validateOutlineForXianxia(outline: StoryOutlineResult) {
  const blockers: ContentBlocker[] = [];

  if (!normalizeText(outline.logline)) {
    blockers.push({
      code: "unclear-lead-goal",
      title: "大纲缺少清晰一句话故事",
      detail: "没有稳定的一句话梗概时，角色和剧本容易持续漂移。",
    });
  }

  if (!normalizeText(outline.leadGoal)) {
    blockers.push({
      code: "unclear-lead-goal",
      title: "主角目标不清",
      detail: "仙侠逆袭样板必须让观众快速知道主角当下最想赢什么、守什么、夺回什么。",
    });
  }

  if (outline.characters.length < 3 || outline.characters.length > 4) {
    blockers.push({
      code: "unclear-lead-goal",
      title: "核心角色数量不符合样板",
      detail: "当前样板要求 3-4 个真正推动剧情的人物，避免功能角色扩散。",
    });
  }

  for (const beat of outline.episodeBeats) {
    if (!normalizeText(beat.openingTrigger) || !normalizeText(beat.hook)) {
      blockers.push({
        code: "missing-hook",
        title: `第 ${beat.episodeNum} 集开场钩子不足`,
        detail: "每集必须明确开场异常/羞辱/代价，而不是平铺设定。",
      });
    }
    if (!normalizeText(beat.pressureSource)) {
      blockers.push({
        code: "unclear-lead-goal",
        title: `第 ${beat.episodeNum} 集压迫来源不清`,
        detail: "必须明确这一集是谁、用什么权力或规则在压主角。",
      });
    }
    if (!normalizeText(beat.escalation)) {
      blockers.push({
        code: "insufficient-escalation",
        title: `第 ${beat.episodeNum} 集升级不足`,
        detail: "每集都要明确冲突如何持续变糟，而不是只给结果。",
      });
    }
    if (!normalizeText(beat.cliffhanger)) {
      blockers.push({
        code: "weak-cliffhanger",
        title: `第 ${beat.episodeNum} 集结尾悬点不足`,
        detail: "仙侠逆袭样板要求每集都必须把局面推向更坏或更危险。",
      });
    }
  }

  return blockers;
}

export function validateScriptForXianxia(input: {
  leadGoal: string;
  structured: StoryScriptDraftResult;
}): {
  blockers: ContentBlocker[];
  meta: ScriptContentMeta;
} {
  const { structured, leadGoal } = input;
  const blockers: ContentBlocker[] = [];
  const openingTrigger = normalizeText(structured.openingTrigger);
  const immediateCost = normalizeText(structured.immediateCost);
  const endingCliffType = normalizeText(structured.endingCliffType);
  const escalationBeats = structured.escalationBeats
    .map((item) => item.trim())
    .filter(Boolean);
  const dialogueMoments = structured.dialogueMoments
    .map((item) => (typeof item === "string" ? item : item.line))
    .filter(Boolean);

  if (!openingTrigger) {
    blockers.push({
      code: "missing-hook",
      title: "开场异常不够明确",
      detail: "需要明确写出前 5 秒抛出的羞辱、危机或代价。",
    });
  }

  if (!immediateCost) {
    blockers.push({
      code: "missing-immediate-cost",
      title: "开场代价不够明确",
      detail: "验证样片要求观众立刻看到主角如果输掉会失去什么。",
    });
  }

  if (escalationBeats.length < XIANXIA_REVENGE_PRODUCTION_SPEC.requiredEscalationCount) {
    blockers.push({
      code: "insufficient-escalation",
      title: "升级次数不足",
      detail: "当前样板要求中段至少两次有效升级，不能只有单次冲突。",
    });
  }

  if (!normalizeText(leadGoal)) {
    blockers.push({
      code: "unclear-lead-goal",
      title: "主角目标未锁清",
      detail: "没有清晰主角目标时，剧本无法稳定围绕逆袭和复仇推进。",
    });
  }

  if (!normalizeText(structured.payoffMoment)) {
    blockers.push({
      code: "weak-payoff",
      title: "缺少明确 payoff",
      detail: "需要给观众一次可感知的反击、打脸或局势翻转。",
    });
  }

  if (!normalizeText(structured.endingHook) || !endingCliffType) {
    blockers.push({
      code: "weak-cliffhanger",
      title: "结尾悬念不够强",
      detail: "结尾必须落到新危机、身份暴露、代价升级或更高阶敌人登场。",
    });
  }

  const overlyLongDialogue = dialogueMoments.some((line) => line.length > 42);
  if (overlyLongDialogue) {
    blockers.push({
      code: "dialogue-too-expository",
      title: "对白解释感过强",
      detail: "短剧台词应尽量短、准、狠，减少整句说明背景或动机。",
    });
  }

  const meta: ScriptContentMeta = {
    openingTrigger,
    immediateCost,
    escalationBeats,
    payoffMoment: normalizeText(structured.payoffMoment),
    endingCliffType,
    contentBlockers: blockers,
    stats: {
      sceneCount: structured.sceneCards.length,
      dialogueMomentCount: dialogueMoments.length,
      hookPass: Boolean(openingTrigger),
      escalationPass:
        escalationBeats.length >= XIANXIA_REVENGE_PRODUCTION_SPEC.requiredEscalationCount,
      cliffhangerPass: Boolean(normalizeText(structured.endingHook) && endingCliffType),
    },
  };

  return { blockers, meta };
}

export function inferSceneDramaticTag(
  scene: StoryScriptSceneCard,
  sceneIndex: number,
  totalScenes: number
) {
  const beatType = normalizeText(scene.beatType).toLowerCase();
  if (sceneIndex === 0) return "hook-shot";
  if (sceneIndex >= totalScenes - 1 || /悬|反转|决裂/.test(scene.exitQuestion || beatType)) return "cliff-shot";
  if (/反杀|反转/.test(beatType)) return "counter-shot";
  if (/压迫|揭露|试探/.test(beatType)) return "pressure-shot";
  return "reaction-shot";
}
