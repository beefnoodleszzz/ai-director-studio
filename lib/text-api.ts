import axios from "axios";

export type TextApiStyle = "responses" | "chat-completions";

export interface TextModelCallOptions {
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function hasConfiguredValue(value: string | undefined | null) {
  return Boolean(value?.trim());
}

function inferApiStyle(baseUrl: string, preferred?: string): TextApiStyle {
  if (preferred === "responses" || preferred === "chat-completions") {
    return preferred;
  }

  return /api\.openai\.com/i.test(baseUrl) ? "responses" : "chat-completions";
}

export function resolveTextProviderConfig() {
  const textApiKey = process.env.TEXT_API_KEY;
  const textBaseUrl = process.env.TEXT_BASE_URL;
  const textModel = process.env.TEXT_MODEL;
  const textApiStyle = process.env.TEXT_API_STYLE;

  if (
    hasConfiguredValue(textApiKey) ||
    hasConfiguredValue(textBaseUrl) ||
    hasConfiguredValue(textModel) ||
    hasConfiguredValue(textApiStyle)
  ) {
    const baseUrl = stripTrailingSlash(
      textBaseUrl ??
        process.env.OPENAI_BASE_URL ??
        process.env.IMAGE_BASE_URL ??
        process.env.DEEPSEEK_BASE_URL ??
        "https://api.openai.com/v1"
    );
    return {
      apiKey: textApiKey ?? process.env.OPENAI_API_KEY ?? process.env.IMAGE_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "",
      baseUrl,
      model: textModel ?? process.env.OPENAI_MODEL ?? "gpt-5.5",
      apiStyle: inferApiStyle(baseUrl, textApiStyle),
    };
  }

  if (
    hasConfiguredValue(process.env.OPENAI_API_KEY) ||
    hasConfiguredValue(process.env.OPENAI_BASE_URL) ||
    hasConfiguredValue(process.env.OPENAI_MODEL)
  ) {
    const baseUrl = stripTrailingSlash(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1");
    return {
      apiKey: process.env.OPENAI_API_KEY ?? "",
      baseUrl,
      model: process.env.OPENAI_MODEL ?? "gpt-5.5",
      apiStyle: inferApiStyle(baseUrl, process.env.OPENAI_API_STYLE),
    };
  }

  if (hasConfiguredValue(process.env.IMAGE_API_KEY) || hasConfiguredValue(process.env.IMAGE_BASE_URL)) {
    const baseUrl = stripTrailingSlash(process.env.IMAGE_BASE_URL ?? "https://api.openai.com/v1");
    return {
      apiKey: process.env.IMAGE_API_KEY ?? "",
      baseUrl,
      model: process.env.IMAGE_TEXT_MODEL ?? "gpt-5.5",
      apiStyle: inferApiStyle(baseUrl, process.env.TEXT_API_STYLE),
    };
  }

  const deepseekBaseUrl = stripTrailingSlash(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1");
  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: deepseekBaseUrl,
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    apiStyle: "chat-completions" as const,
  };
}

function extractResponsesText(data: unknown) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }

  const content = record.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return content?.join("\n").trim() ?? "";
}

function extractChatCompletionText(data: unknown) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as {
    choices?: Array<{
      message?: {
        content?:
          | string
          | Array<{
              type?: string;
              text?: string;
            }>;
      };
    }>;
  };

  const content = record.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n")
      .trim();
  }

  return "";
}

function formatProviderError(error: unknown, label: string) {
  if (axios.isAxiosError(error) && error.response) {
    const detail =
      typeof error.response.data === "object"
        ? JSON.stringify(error.response.data)
        : String(error.response.data);
    const code = error.response.headers["x-error-code"] ?? error.response.headers["x-request-id"];
    return new Error(
      `${label} HTTP ${error.response.status}${code ? ` (${String(code)})` : ""}: ${detail}`
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

function shouldFallbackToChat(error: unknown) {
  if (!axios.isAxiosError(error) || !error.response) {
    return false;
  }

  if ([404, 405, 501].includes(error.response.status)) {
    return true;
  }

  const detail =
    typeof error.response.data === "object"
      ? JSON.stringify(error.response.data)
      : String(error.response.data ?? "");

  return /responses|unsupported|not found|unknown endpoint/i.test(detail);
}

function buildReasoningPayload(model: string, reasoningEffort?: TextModelCallOptions["reasoningEffort"]) {
  if (!reasoningEffort) {
    return {};
  }

  if (!/^gpt-5/i.test(model) && !/^o\d/i.test(model)) {
    return {};
  }

  return {
    reasoning: {
      effort: reasoningEffort,
    },
  };
}

async function callResponsesApi(config: ReturnType<typeof resolveTextProviderConfig>, options: TextModelCallOptions) {
  const response = await axios.post(
    `${config.baseUrl}/responses`,
    {
      model: options.model ?? config.model,
      input: [
        ...(options.systemPrompt
          ? [
              {
                role: "system",
                content: [{ type: "input_text", text: options.systemPrompt }],
              },
            ]
          : []),
        {
          role: "user",
          content: [{ type: "input_text", text: options.userPrompt }],
        },
      ],
      ...(typeof options.maxOutputTokens === "number"
        ? { max_output_tokens: options.maxOutputTokens }
        : {}),
      ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
      ...buildReasoningPayload(options.model ?? config.model, options.reasoningEffort),
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 180_000,
    }
  );

  const text = extractResponsesText(response.data);
  if (!text) {
    throw new Error("Responses API returned no text output");
  }
  return text;
}

async function callChatCompletionsApi(config: ReturnType<typeof resolveTextProviderConfig>, options: TextModelCallOptions) {
  const response = await axios.post(
    `${config.baseUrl}/chat/completions`,
    {
      model: options.model ?? config.model,
      messages: [
        ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
        { role: "user", content: options.userPrompt },
      ],
      ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
      ...(typeof options.maxOutputTokens === "number"
        ? { max_completion_tokens: options.maxOutputTokens, max_tokens: options.maxOutputTokens }
        : {}),
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 180_000,
    }
  );

  const text = extractChatCompletionText(response.data);
  if (!text) {
    throw new Error("Chat Completions API returned no text output");
  }
  return text;
}

export async function callTextModel(options: TextModelCallOptions) {
  const config = resolveTextProviderConfig();
  if (!config.apiKey) {
    throw new Error(
      "TEXT_API_KEY / OPENAI_API_KEY / IMAGE_API_KEY / DEEPSEEK_API_KEY is not configured"
    );
  }

  if (config.apiStyle === "responses") {
    try {
      return await callResponsesApi(config, options);
    } catch (error) {
      if (!shouldFallbackToChat(error)) {
        throw formatProviderError(error, "Text responses API");
      }
    }
  }

  try {
    return await callChatCompletionsApi(config, options);
  } catch (error) {
    throw formatProviderError(error, "Text chat API");
  }
}
