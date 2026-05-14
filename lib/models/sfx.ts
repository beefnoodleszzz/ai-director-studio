/**
 * SFX 环境音效生成适配器
 * 优先从 ElevenLabs / MiniMax SFX 等接口生成，
 * 未配置时降级为从本地预置音效库 fallback（避免阻塞主流程）
 */
import axios from "axios";
import path from "path";
import fs from "fs";
import { generateId } from "@/lib/utils";
import { saveBase64Asset } from "@/lib/asset";

export interface SfxResult {
  localPath: string;
}

export interface SfxProvider {
  generate(prompt: string, durationSec?: number): Promise<SfxResult>;
}

/** ElevenLabs Sound Generation（如果配置了 SFX_API_KEY 则启用）*/
class ElevenLabsSfxAdapter implements SfxProvider {
  private apiKey = process.env.SFX_API_KEY ?? "";
  private baseUrl = "https://api.elevenlabs.io/v1/sound-generation";

  async generate(prompt: string, durationSec: number = 5): Promise<SfxResult> {
    const resp = await axios.post(
      this.baseUrl,
      { text: prompt, duration_seconds: durationSec, prompt_influence: 0.5 },
      {
        headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json" },
        responseType: "arraybuffer",
        timeout: 60_000,
      }
    );
    const filename = `sfx_${generateId().slice(0, 8)}.mp3`;
    const dir = path.join(process.cwd(), "public", "workspace", "audio");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, resp.data);
    return { localPath: `/workspace/audio/${filename}` };
  }
}

/** MiniMax T2A 作为 SFX 回退（用 audioPrompt 描述音效）*/
class MiniMaxSfxAdapter implements SfxProvider {
  private apiKey = process.env.TTS_API_KEY ?? "";
  private baseUrl = process.env.TTS_BASE_URL ?? "https://api.minimaxi.chat/v1";
  private model = process.env.TTS_MODEL ?? "speech-02-hd";

  async generate(prompt: string): Promise<SfxResult> {
    const resp = await axios.post(
      `${this.baseUrl}/t2a_v2`,
      {
        model: this.model,
        text: `[${prompt}]`, // MiniMax 支持情绪/音效标签
        stream: false,
        voice_setting: { voice_id: "Calm_Beast", speed: 1.0, vol: 0.8, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3" },
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        timeout: 60_000,
      }
    );

    const audioData: string | undefined =
      resp.data?.data?.audio ?? resp.data?.audio_file;

    if (!audioData) throw new Error("SFX generation returned no audio");

    const filename = `sfx_${generateId().slice(0, 8)}.mp3`;
    const localPath = saveBase64Asset(audioData, filename);
    return { localPath };
  }
}

export class SfxGenerator {
  static getProvider(): SfxProvider {
    if (process.env.SFX_API_KEY) return new ElevenLabsSfxAdapter();
    if (process.env.TTS_API_KEY) return new MiniMaxSfxAdapter();
    throw new Error("No SFX provider configured (SFX_API_KEY or TTS_API_KEY required)");
  }
}
