import { NextRequest, NextResponse } from "next/server";
import { callTextModel } from "@/lib/text-api";

const SYSTEM_PROMPT = `你是一位顶尖的商业短剧编剧和世界观设计师，专注于为抖音、小红书等短视频平台创作高爆款内容。

你的任务：根据用户输入的简短创意，生成一份完整、专业、极具吸引力的"世界观设定文档"。

输出要求（严格按以下结构，纯文本，不要用 markdown 标题符号）：

【故事宇宙】
用1~2句话描述核心世界设定（时代、地点、权力格局）。

【核心矛盾】
用1句话点出最大的社会或人际冲突，要有张力和爆点。

【主角弧光】
描述主角的起点处境（弱、穷、受辱等）和终点蜕变（强、富、复仇成功等），要有戏剧反差。

【情感钩子】
列出 2~3 个让观众上瘾、刷了停不下来的核心情绪点（如：下跪反杀、身份反转、前任悔恨）。

【视觉调性】
描述整体画面风格和色调（用于指导 AI 图像生成），要具体，如：冷蓝高饱和、都市夜景、名品特写。

【角色矩阵】
列出 2~4 个核心角色的名字、身份、性格标签（一行一个），并注明各自的外貌关键词（用于 AI 定妆照生成）。

输出必须是中文，语气专业、有力、充满张力，像是一份真实的商业短剧开发提案。`;

export async function POST(req: NextRequest) {
  try {
    const { idea } = (await req.json()) as { idea: string };
    if (!idea?.trim()) {
      return NextResponse.json({ error: "idea is required" }, { status: 400 });
    }

    const lore = await callTextModel({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `我的创意：${idea.trim()}\n\n请帮我生成完整的世界观设定。`,
      temperature: 0.85,
      maxOutputTokens: 2000,
      reasoningEffort: "high",
    });
    return NextResponse.json({ lore });
  } catch (err) {
    console.error("[generate/lore]", err);
    return NextResponse.json({ error: "World lore generation failed" }, { status: 500 });
  }
}
