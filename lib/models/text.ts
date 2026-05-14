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
  const existingNames = characters.map((c) => c.name).join("、") || "（暂无）";
  const characterList = characters.map((c) => `- ${c.name}: ${c.prompt}`).join("\n") || "（暂无角色）";

  const systemPrompt = `你是一位顶级的商业短剧分镜师与角色导演。请将用户提供的剧本拆解为 10~20 个颗粒度极细的分镜卡片，严格输出 JSON，不要包含任何其他文字或 markdown 标记。

【当前已有角色库】：${existingNames}

【任务指令】：
1. 将剧本拆解为分镜列表（scenes）。每个分镜的 visualPrompt 必须是英文，风格精准、镜头感强，并将对应角色的外貌关键词直接嵌入 visualPrompt。
2. 仔细检查剧本中是否出现了【不在已有角色库中的新重要角色】。
   - 符合提取条件：有名字、有台词、对剧情有推进作用的角色（如：新反派、新恋人、关键证人等）。
   - 绝对不提取：路人甲/乙、保安、服务员、群众、泛指的"员工"等非关键 NPC，这类角色在 visualPrompt 中用泛化描述即可。
3. 将发现的新重要角色放入 newCharacters 数组，给出姓名和详细外貌+性格描述（用于后续生成定妆照）。
4. 如果没有新角色，newCharacters 返回空数组 []。

JSON 格式：
{
  "newCharacters": [
    {
      "name": "角色姓名",
      "description": "详细外貌描述：年龄、五官、发型、服装风格、气质关键词（中文）"
    }
  ],
  "scenes": [
    {
      "sceneOrder": 1,
      "visualPrompt": "English visual description for image generation model, cinematic, detailed",
      "dialogue": "角色台词原文",
      "audioPrompt": "情绪与音效标注，如[冷笑][雨声]"
    }
  ],
  "episodeSummary": "本集剧情100字以内摘要"
}`;

  const userPrompt = `世界观：${globalLore}\n\n已有角色：\n${characterList}\n\n剧本：\n${script}`;

  const raw = await callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(jsonStr) as ScriptBreakdownResult;

  // 兼容旧格式（无 newCharacters 字段）
  if (!parsed.newCharacters) parsed.newCharacters = [];

  return parsed;
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
