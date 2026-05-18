/**
 * 音频生成 Workflow
 *
 * 职责：
 * 1. 按角色 VoiceProfile 生成对白配音（TTS）
 * 2. 支持环境音（SFX）生成
 * 3. 写入 Take 记录（takeType: audio | sfx | bgm）
 * 4. 基础音频 QA（时长、响度）
 */

import fs from "fs";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { downloadToTake, saveTakeInputJson, initTakeDirs } from "@/lib/asset";
import { enqueueTask } from "@/lib/task-queue";
import { generateId } from "@/lib/utils";
import { normalizeShotStateById, recalculateEpisodeStage } from "@/lib/production-state";
import type { AudioGenInput } from "./types";

// ─── TTS Provider 抽象 ────────────────────────────────────────────────────────

interface TTSProvider {
  name: string;
  synthesize(text: string, options: TTSOptions): Promise<{ audioUrl?: string; base64?: string }>;
}

interface TTSOptions {
  voiceId?: string;
  speed?: number;
  volume?: number;
  language?: string;
}

class DoubaoTTSProvider implements TTSProvider {
  name = "doubao-tts";
  private apiKey = process.env.DOUBAO_TTS_API_KEY ?? "";
  private baseUrl = process.env.DOUBAO_TTS_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";

  async synthesize(text: string, options: TTSOptions) {
    if (!this.apiKey) throw new Error("MINIMAX_API_KEY is not configured");

    const model = process.env.TTS_MODEL ?? "doubao-voice-lite-tts";
    const response = await axios.post(
      `${this.baseUrl}/audio/speech`,
      {
        model,
        input: text,
        voice: options.voiceId ?? "zh_female_doubao",
        response_format: "mp3",
        speed: options.speed ?? 1,
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        timeout: 60_000,
        responseType: "arraybuffer",
      }
    );

    const buffer = Buffer.from(response.data);
    const base64 = buffer.toString("base64");
    return { base64 };
  }
}

const TTS_PROVIDERS: Record<string, TTSProvider> = {
  "doubao-tts": new DoubaoTTSProvider(),
};

function getTTSProvider(name?: string): TTSProvider {
  const key = name ?? process.env.TTS_PROVIDER ?? "doubao-tts";
  const p = TTS_PROVIDERS[key];
  if (!p) throw new Error(`Unknown TTS provider: ${key}`);
  return p;
}

// ─── SFX Provider 抽象 ────────────────────────────────────────────────────────

interface SFXProvider {
  name: string;
  generate(prompt: string): Promise<{ audioUrl?: string; base64?: string }>;
}

class ElevenLabsSFXProvider implements SFXProvider {
  name = "elevenlabs-sfx";
  private apiKey = process.env.ELEVENLABS_API_KEY ?? "";

  async generate(prompt: string) {
    if (!this.apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

    const response = await axios.post(
      "https://api.elevenlabs.io/v1/sound-generation",
      { text: prompt, duration_seconds: 4, prompt_influence: 0.3 },
      {
        headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json" },
        responseType: "arraybuffer",
        timeout: 60_000,
      }
    );

    const base64 = Buffer.from(response.data).toString("base64");
    return { base64 };
  }
}

// ─── 音频基础 QA ──────────────────────────────────────────────────────────────

function qaAudio(localPath: string): { verdict: string; score: number; details: string } {
  try {
    const stats = fs.statSync(localPath);
    if (stats.size < 1000) return { verdict: "fail", score: 0, details: "Audio file too small (< 1KB)" };
    if (stats.size > 50_000_000) return { verdict: "warn", score: 0.5, details: "Audio file very large (> 50MB)" };
    return { verdict: "pass", score: 0.8, details: `File size: ${stats.size} bytes` };
  } catch {
    return { verdict: "fail", score: 0, details: "Cannot read audio file" };
  }
}

// ─── 主入口：为 Shot 生成对白音频 ────────────────────────────────────────────

export interface GenerateAudioResult {
  takeId: string;
  localPath: string;
  url: string;
}

export async function generateShotAudio(input: AudioGenInput): Promise<GenerateAudioResult> {
  const { projectId, episodeId, sceneId, shotId, dialogue, voiceId, provider } = input;

  if (!dialogue.trim()) throw new Error("No dialogue to synthesize");

  const shot = await prisma.shot.findUnique({
    where: { id: shotId },
    include: { scene: { include: { episode: true } } },
  });
  if (!shot) throw new Error(`Shot ${shotId} not found`);

  // 查询角色声音配置（取第一个主体角色）
  let resolvedVoiceId = voiceId;
  if (!resolvedVoiceId && shot.subjectCharIds) {
    const charIds = JSON.parse(shot.subjectCharIds) as string[];
    if (charIds.length > 0) {
      const vp = await prisma.voiceProfile.findUnique({ where: { characterId: charIds[0] } });
      if (vp) resolvedVoiceId = vp.voiceId || undefined;
    }
  }

  const ttsProvider = getTTSProvider(provider);
  const takeId = generateId();
  initTakeDirs(projectId, episodeId, sceneId, shotId, takeId);

  const paramsSnapshot = { provider: ttsProvider.name, voiceId: resolvedVoiceId, dialogue };
  saveTakeInputJson(projectId, episodeId, sceneId, shotId, takeId, paramsSnapshot);

  const result = await ttsProvider.synthesize(dialogue, { voiceId: resolvedVoiceId });

  let savedPath: string;
  let savedUrl: string;

  if (result.base64) {
    const { saveBase64ToTake } = await import("@/lib/asset");
    const saved = saveBase64ToTake(result.base64, projectId, episodeId, sceneId, shotId, takeId, "audio.mp3");
    savedPath = saved.localPath;
    savedUrl = saved.url;
  } else if (result.audioUrl) {
    const saved = await downloadToTake(result.audioUrl, projectId, episodeId, sceneId, shotId, takeId, "audio.mp3");
    savedPath = saved.localPath;
    savedUrl = saved.url;
  } else {
    throw new Error("TTS returned no audio");
  }

  const qa = qaAudio(savedPath);

  const take = await prisma.take.create({
    data: {
      id: takeId,
      shotId,
      takeType: "audio",
      provider: ttsProvider.name,
      paramsSnapshot: JSON.stringify(paramsSnapshot),
      promptSnapshot: dialogue,
      localAudio: savedUrl,
      autoScore: qa.score,
      isAdopted: true,
    },
  });

  await prisma.shot.update({
    where: { id: shotId },
    data: {
      adoptedAudioTakeId: take.id,
      ...(qa.verdict === "fail"
        ? {
            blockReason: "audio-qa-failed",
            blockMeta: JSON.stringify({
              code: "audio-qa-failed",
              message: qa.details,
              stage: "audio",
              shotId,
              takeId: take.id,
              details: [qa.details],
            }),
          }
        : {
            ...(shot.blockReason === "audio-qa-failed" ? { blockReason: "", blockMeta: "" } : {}),
          }),
    },
  });
  await normalizeShotStateById(shotId);
  await recalculateEpisodeStage(episodeId);

  await prisma.review.create({
    data: {
      takeId: take.id,
      reviewType: "audio-qa",
      verdict: qa.verdict as "pass" | "warn" | "fail",
      score: qa.score,
      failTags: "[]",
      suggestion: qa.verdict === "fail" ? "must-redo" : "adopt",
      details: qa.details,
    },
  });

  return { takeId, localPath: savedPath, url: savedUrl };
}

// ─── SFX 生成 ─────────────────────────────────────────────────────────────────

export async function generateShotSFX(
  projectId: string,
  episodeId: string,
  sceneId: string,
  shotId: string,
  sfxPrompt: string
): Promise<GenerateAudioResult> {
  const sfxProvider = new ElevenLabsSFXProvider();
  const takeId = generateId();
  initTakeDirs(projectId, episodeId, sceneId, shotId, takeId);

  saveTakeInputJson(projectId, episodeId, sceneId, shotId, takeId, { provider: sfxProvider.name, prompt: sfxPrompt });

  const result = await sfxProvider.generate(sfxPrompt);

  let savedPath: string;
  let savedUrl: string;

  if (result.base64) {
    const { saveBase64ToTake } = await import("@/lib/asset");
    const saved = saveBase64ToTake(result.base64, projectId, episodeId, sceneId, shotId, takeId, "sfx.mp3");
    savedPath = saved.localPath;
    savedUrl = saved.url;
  } else {
    throw new Error("SFX generation returned no audio");
  }

  await prisma.take.create({
    data: {
      id: takeId,
      shotId,
      takeType: "sfx",
      provider: sfxProvider.name,
      promptSnapshot: sfxPrompt,
      localAudio: savedUrl,
      autoScore: 0.7,
      isAdopted: true,
    },
  });

  return { takeId, localPath: savedPath, url: savedUrl };
}

// ─── 含任务追踪的包装入口 ─────────────────────────────────────────────────────

export async function generateShotAudioWithTask(input: AudioGenInput) {
  return enqueueTask(
    {
      projectId: input.projectId,
      shotId: input.shotId,
      taskType: "audio",
      taskStage: "audio",
      inputRef: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        sceneId: input.sceneId,
        shotId: input.shotId,
        dialogue: input.dialogue,
        audioPrompt: input.audioPrompt,
        voiceId: input.voiceId,
        provider: input.provider,
        outputType: "audio",
        stage: "audio",
      },
    },
    () => generateShotAudio(input)
  );
}
