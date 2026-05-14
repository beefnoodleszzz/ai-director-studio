import axios from "axios";
import { downloadAsset, saveBase64Asset } from "@/lib/asset";
import { generateId, promptHash } from "@/lib/utils";
import type { AudioResult } from "@/types";

export interface AudioProvider {
  synthesize(text: string, audioPrompt?: string): Promise<AudioResult>;
}

class MiniMaxSpeechAdapter implements AudioProvider {
  private apiKey = process.env.TTS_API_KEY ?? "";
  private baseUrl = process.env.TTS_BASE_URL ?? "https://api.minimaxi.chat/v1";
  private model = process.env.TTS_MODEL ?? "speech-02-hd";

  async synthesize(text: string, audioPrompt?: string): Promise<AudioResult> {
    if (!this.apiKey) throw new Error("TTS_API_KEY is not configured");

    const emotionText = audioPrompt ? `${audioPrompt}${text}` : text;

    const response = await axios.post(
      `${this.baseUrl}/t2a_v2`,
      {
        model: this.model,
        text: emotionText,
        stream: false,
        voice_setting: {
          voice_id: "female-shaonv",
          speed: 1.0,
          vol: 1.0,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "mp3",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 60_000,
      }
    );

    const audioData: string | undefined =
      response.data?.data?.audio ??
      response.data?.audio_file;

    if (audioData) {
      const filename = `audio_${promptHash(text)}_${generateId().slice(0, 6)}.mp3`;
      const localPath = saveBase64Asset(audioData, filename);
      return { audioUrl: localPath, localPath };
    }

    const audioUrl: string =
      response.data?.data?.url ??
      response.data?.url;

    if (!audioUrl) throw new Error("MiniMax TTS returned no audio");
    const filename = `audio_${promptHash(text)}_${generateId().slice(0, 6)}.mp3`;
    const localPath = await downloadAsset(audioUrl, filename);
    return { audioUrl, localPath };
  }
}

export class AudioGenerator {
  static getProvider(name: string = "minimax"): AudioProvider {
    if (name === "minimax") return new MiniMaxSpeechAdapter();
    throw new Error(`Unknown audio provider: ${name}`);
  }
}
