import axios from "axios";
import { downloadAsset } from "@/lib/asset";
import { sleep, generateId } from "@/lib/utils";
import type { VideoTaskResult } from "@/types";

export interface VideoProvider {
  submitI2V(imageUrl: string, prompt: string): Promise<string>;
  queryTask(taskId: string): Promise<VideoTaskResult>;
  generateI2V(imageUrl: string, prompt: string): Promise<VideoTaskResult>;
}

class KlingAdapter implements VideoProvider {
  private apiKey = process.env.KLING_API_KEY ?? "";
  private baseUrl = process.env.KLING_BASE_URL ?? "https://api.klingai.com/v1";

  async submitI2V(imageUrl: string, prompt: string): Promise<string> {
    if (!this.apiKey) throw new Error("KLING_API_KEY is not configured");

    const response = await axios.post(
      `${this.baseUrl}/videos/image2video`,
      {
        model_name: "kling-v1",
        image: imageUrl,
        prompt,
        duration: "5",
        aspect_ratio: "16:9",
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        timeout: 30_000,
      }
    );

    return response.data?.data?.task_id ?? response.data?.task_id;
  }

  async queryTask(taskId: string): Promise<VideoTaskResult> {
    if (!this.apiKey) throw new Error("KLING_API_KEY is not configured");

    const response = await axios.get(
      `${this.baseUrl}/videos/image2video/${taskId}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 15_000,
      }
    );

    const data = response.data?.data ?? response.data;
    const taskStatus = data?.task_status ?? data?.status;
    const videoUrl: string | undefined =
      data?.task_result?.videos?.[0]?.url ?? data?.video_url;

    if (taskStatus === "succeed" || taskStatus === "completed") {
      if (!videoUrl) return { taskId, status: "processing", progress: 80 };
      const filename = `vid_kling_${generateId().slice(0, 8)}.mp4`;
      const localPath = await downloadAsset(videoUrl, filename);
      return { taskId, status: "completed", progress: 100, videoUrl, localPath };
    }

    if (taskStatus === "failed") {
      return { taskId, status: "failed", progress: 0 };
    }

    return { taskId, status: "processing", progress: 50 };
  }

  async generateI2V(imageUrl: string, prompt: string): Promise<VideoTaskResult> {
    const taskId = await this.submitI2V(imageUrl, prompt);
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const result = await this.queryTask(taskId);
      if (result.status === "completed" || result.status === "failed") return result;
    }
    return { taskId, status: "failed", progress: 0 };
  }
}

class HailuoAdapter implements VideoProvider {
  private apiKey = process.env.HAILUO_API_KEY ?? "";
  private baseUrl = process.env.HAILUO_BASE_URL ?? "https://api.minimaxi.chat/v1";

  async submitI2V(imageUrl: string, prompt: string): Promise<string> {
    if (!this.apiKey) throw new Error("HAILUO_API_KEY is not configured");

    const response = await axios.post(
      `${this.baseUrl}/video_generation`,
      {
        model: "video-01",
        prompt,
        first_frame_image: imageUrl,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      }
    );

    return response.data?.task_id ?? response.data?.data?.task_id;
  }

  async queryTask(taskId: string): Promise<VideoTaskResult> {
    if (!this.apiKey) throw new Error("HAILUO_API_KEY is not configured");

    const response = await axios.get(
      `${this.baseUrl}/query/video_generation?task_id=${taskId}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 15_000,
      }
    );

    const status = response.data?.status;
    const videoUrl: string | undefined = response.data?.file_id
      ? `${this.baseUrl}/files/${response.data.file_id}`
      : undefined;

    if (status === "Success") {
      if (!videoUrl) return { taskId, status: "processing", progress: 80 };
      const filename = `vid_hailuo_${generateId().slice(0, 8)}.mp4`;
      const localPath = await downloadAsset(videoUrl, filename);
      return { taskId, status: "completed", progress: 100, videoUrl, localPath };
    }
    if (status === "Fail") return { taskId, status: "failed", progress: 0 };
    return { taskId, status: "processing", progress: 50 };
  }

  async generateI2V(imageUrl: string, prompt: string): Promise<VideoTaskResult> {
    const taskId = await this.submitI2V(imageUrl, prompt);
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const result = await this.queryTask(taskId);
      if (result.status === "completed" || result.status === "failed") return result;
    }
    return { taskId, status: "failed", progress: 0 };
  }
}

export class VideoGenerator {
  static getProvider(name?: string): VideoProvider {
    const provider = name ?? process.env.VIDEO_PROVIDER ?? "kling";
    if (provider === "kling") return new KlingAdapter();
    if (provider === "hailuo") return new HailuoAdapter();
    throw new Error(`Unknown video provider: ${provider}`);
  }
}
