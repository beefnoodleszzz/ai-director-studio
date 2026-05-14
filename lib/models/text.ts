import axios from "axios";
import type { ScriptBreakdownResult, CharacterRef } from "@/types";

interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callDeepSeek(messages: DeepSeekMessage[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages, temperature: 0.7 },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120_000,
    }
  );

  return response.data.choices[0].message.content as string;
}

export async function breakdownScript(
  script: string,
  characters: CharacterRef[],
  globalLore: string
): Promise<ScriptBreakdownResult> {
  const characterList = characters
    .map((c) => `- ${c.name}: ${c.prompt}`)
    .join("\n");

  const systemPrompt = `你是一位专业的影视分镜师。将用户提供的剧本拆解为10~20个分镜卡片，严格输出 JSON，不要包含其他文字。

JSON 格式：
{
  "scenes": [
    {
      "sceneOrder": 1,
      "visualPrompt": "英文画面描述，适合图像生成模型",
      "dialogue": "角色台词",
      "audioPrompt": "情绪标注，如[轻松]或[哭腔]"
    }
  ],
  "episodeSummary": "本集剧情100字以内摘要"
}`;

  const userPrompt = `世界观：${globalLore}\n\n角色：\n${characterList}\n\n剧本：\n${script}`;

  const raw = await callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as ScriptBreakdownResult;
}

export async function generateNextEpisodeSeed(
  prevSummary: string,
  characters: CharacterRef[],
  globalLore: string
): Promise<string> {
  const characterList = characters.map((c) => `- ${c.name}: ${c.prompt}`).join("\n");

  const result = await callDeepSeek([
    {
      role: "system",
      content: "你是影视编剧助手，根据上一集摘要和角色设定，生成下一集的剧情走向提示（200字以内）。",
    },
    {
      role: "user",
      content: `世界观：${globalLore}\n\n角色：\n${characterList}\n\n上一集摘要：${prevSummary}`,
    },
  ]);

  return result;
}
