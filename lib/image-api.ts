export const DEFAULT_IMAGE_PROVIDER = "sakura";

const IMAGE_SIZE_BY_ASPECT: Record<string, string> = {
  "1:1": "1024x1024",
  "9:16": "1024x1792",
  "16:9": "1792x1024",
};

type ImageGenerationOptions = {
  aspectRatio?: string;
  negativePrompt?: string;
};

type ImageGenerationItem =
  | string
  | {
      url?: string;
      image_url?: string;
      imageUrl?: string;
      b64_json?: string;
      base64?: string;
      image_base64?: string;
    };

type ImageGenerationResponse =
  | {
      data?: ImageGenerationItem[];
      images?: ImageGenerationItem[];
      output?:
        | string
        | ImageGenerationItem[]
        | {
            images?: ImageGenerationItem[];
          };
    }
  | undefined;

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function stripDataUrlPrefix(value: string) {
  return value.replace(/^data:[^;]+;base64,/, "");
}

export function resolveImageProviderConfig() {
  const apiKey = process.env.IMAGE_API_KEY ?? process.env.SEEDREAM_API_KEY;
  const baseUrl = stripTrailingSlash(
    process.env.IMAGE_BASE_URL ??
      process.env.SEEDREAM_BASE_URL ??
      "https://sakura886.site/v1"
  );
  const model = process.env.IMAGE_MODEL ?? process.env.SEEDREAM_MODEL ?? "gpt-image-2";

  return { apiKey, baseUrl, model };
}

export function resolveImageSize(aspectRatio?: string) {
  if (aspectRatio && IMAGE_SIZE_BY_ASPECT[aspectRatio]) {
    return IMAGE_SIZE_BY_ASPECT[aspectRatio];
  }

  const envAspectRatio = process.env.IMAGE_ASPECT_RATIO;
  if (envAspectRatio && IMAGE_SIZE_BY_ASPECT[envAspectRatio]) {
    return IMAGE_SIZE_BY_ASPECT[envAspectRatio];
  }

  return process.env.IMAGE_SIZE ?? "1024x1024";
}

export function resolveImageRequestTimeoutMs() {
  const raw = process.env.IMAGE_TIMEOUT_MS ?? process.env.IMAGE_REQUEST_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 300_000;
}

export function buildImageGenerationBody(
  prompt: string,
  options?: ImageGenerationOptions
) {
  const { model } = resolveImageProviderConfig();
  const negativePrompt = options?.negativePrompt?.trim();
  const finalPrompt = negativePrompt
    ? `${prompt}\n\nAvoid: ${negativePrompt}`
    : prompt;

  return {
    model,
    prompt: finalPrompt,
    size: resolveImageSize(options?.aspectRatio),
  };
}

export function extractGeneratedImage(data: ImageGenerationResponse): {
  imageUrl: string;
  base64?: string;
} {
  const primary =
    data?.data?.[0] ??
    data?.images?.[0] ??
    (typeof data?.output === "object" && !Array.isArray(data.output)
      ? data.output.images?.[0]
      : undefined) ??
    (Array.isArray(data?.output) ? data.output[0] : undefined);

  if (typeof primary === "string") {
    if (/^https?:\/\//.test(primary)) {
      return { imageUrl: primary };
    }

    const base64 = stripDataUrlPrefix(primary);
    if (base64) {
      return { imageUrl: "", base64 };
    }
  }

  const imageUrl =
    (typeof primary === "object" ? primary.url : undefined) ??
    (typeof primary === "object" ? primary.image_url : undefined) ??
    (typeof primary === "object" ? primary.imageUrl : undefined) ??
    (typeof data?.output === "string" && /^https?:\/\//.test(data.output)
      ? data.output
      : undefined);

  const rawBase64 =
    (typeof primary === "object" ? primary.b64_json : undefined) ??
    (typeof primary === "object" ? primary.base64 : undefined) ??
    (typeof primary === "object" ? primary.image_base64 : undefined) ??
    (typeof data?.output === "string" && !/^https?:\/\//.test(data.output)
      ? data.output
      : undefined);

  const base64 =
    typeof rawBase64 === "string" && rawBase64.length > 0
      ? stripDataUrlPrefix(rawBase64)
      : undefined;

  if (!imageUrl && !base64) {
    throw new Error("Image API returned no usable image payload");
  }

  return {
    imageUrl: typeof imageUrl === "string" ? imageUrl : "",
    ...(base64 ? { base64 } : {}),
  };
}
