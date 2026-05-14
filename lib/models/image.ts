import axios from "axios";
import { downloadAsset } from "@/lib/asset";
import { generateId, promptHash } from "@/lib/utils";
import type { GenerateImageResult } from "@/types";

interface SeedreamRequest {
  prompt: string;
  aspect_ratio?: string;
  image_url?: string;
}

async function callSeedream(
  prompt: string,
  refImageUrl?: string
): Promise<string> {
  const apiKey = process.env.SEEDREAM_API_KEY;
  const baseUrl = process.env.SEEDREAM_BASE_URL ?? "https://api.seedream.io/v1";

  if (!apiKey) throw new Error("SEEDREAM_API_KEY is not configured");

  const body: SeedreamRequest = { prompt, aspect_ratio: "16:9" };
  if (refImageUrl) body.image_url = refImageUrl;

  const response = await axios.post(`${baseUrl}/images/generations`, body, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    timeout: 120_000,
  });

  const imageUrl: string =
    response.data?.data?.[0]?.url ??
    response.data?.images?.[0]?.url ??
    response.data?.output?.images?.[0];

  if (!imageUrl) throw new Error("Seedream returned no image URL");
  return imageUrl;
}

export interface ImageProvider {
  generate(prompt: string, refImageUrl?: string): Promise<GenerateImageResult>;
}

class SeedreamAdapter implements ImageProvider {
  async generate(prompt: string, refImageUrl?: string): Promise<GenerateImageResult> {
    const imageUrl = await callSeedream(prompt, refImageUrl);
    const filename = `img_${promptHash(prompt)}_${generateId().slice(0, 6)}.jpg`;
    const localPath = await downloadAsset(imageUrl, filename);
    return { imageUrl, localPath };
  }
}

export class ImageGenerator {
  static getProvider(name: string = "seedream"): ImageProvider {
    if (name === "seedream") return new SeedreamAdapter();
    throw new Error(`Unknown image provider: ${name}`);
  }
}
