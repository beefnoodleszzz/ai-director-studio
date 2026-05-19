/**
 * 资产目录管理
 *
 * 目录结构：
 * workspace/storage/public/projects/{projectId}/
 *   project.json
 *   style-bible.json
 *   characters/{characterId}/
 *     bible.json
 *     refs/        — 定妆参考图
 *     angles/      — 多角度图
 *     expressions/ — 表情图
 *     wardrobe/    — 服装变体
 *   episodes/{episodeId}/
 *     episode.json
 *     scenes/{sceneId}/
 *       scene.json
 *       shots/{shotId}/
 *         shot.json
 *         takes/{takeId}/
 *           input.json    — 输入参数快照
 *           review.json   — QA 评审结果
 *           image.jpg
 *           video.mp4
 *           audio.mp3
 *           sfx.mp3
 *           bgm.mp3
 *     exports/    — 本集成片
 *   cache/
 *   temp/
 */

import fs from "fs";
import path from "path";
import axios from "axios";

export const APP_DATA_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  process.env.APP_DATA_DIR?.trim() || "workspace"
);
export const WORKSPACE_DIR = path.join(APP_DATA_DIR, "storage");
export const WORKSPACE_PUBLIC_DIR = path.join(WORKSPACE_DIR, "public");
export const WORKSPACE_PRIVATE_DIR = path.join(WORKSPACE_DIR, "private");
export const WORKSPACE_URL_PREFIX = "/workspace";

// ─── 目录路径生成 ─────────────────────────────────────────────────────────────

export const paths = {
  project: (projectId: string) =>
    path.join(WORKSPACE_PUBLIC_DIR, "projects", projectId),

  styleBible: (projectId: string) =>
    path.join(WORKSPACE_PUBLIC_DIR, "projects", projectId, "style-bible.json"),

  character: (projectId: string, characterId: string) =>
    path.join(WORKSPACE_PUBLIC_DIR, "projects", projectId, "characters", characterId),

  characterAsset: (
    projectId: string,
    characterId: string,
    type: "refs" | "angles" | "expressions" | "wardrobe",
    filename: string
  ) =>
    path.join(
      WORKSPACE_PUBLIC_DIR,
      "projects",
      projectId,
      "characters",
      characterId,
      type,
      filename
    ),

  episode: (projectId: string, episodeId: string) =>
    path.join(WORKSPACE_PUBLIC_DIR, "projects", projectId, "episodes", episodeId),

  scene: (projectId: string, episodeId: string, sceneId: string) =>
    path.join(
      WORKSPACE_PUBLIC_DIR,
      "projects",
      projectId,
      "episodes",
      episodeId,
      "scenes",
      sceneId
    ),

  shot: (
    projectId: string,
    episodeId: string,
    sceneId: string,
    shotId: string
  ) =>
    path.join(
      WORKSPACE_PUBLIC_DIR,
      "projects",
      projectId,
      "episodes",
      episodeId,
      "scenes",
      sceneId,
      "shots",
      shotId
    ),

  take: (
    projectId: string,
    episodeId: string,
    sceneId: string,
    shotId: string,
    takeId: string
  ) =>
    path.join(
      WORKSPACE_PUBLIC_DIR,
      "projects",
      projectId,
      "episodes",
      episodeId,
      "scenes",
      sceneId,
      "shots",
      shotId,
      "takes",
      takeId
    ),

  exports: (projectId: string, episodeId: string) =>
    path.join(
      WORKSPACE_PUBLIC_DIR,
      "projects",
      projectId,
      "episodes",
      episodeId,
      "exports"
    ),

  cache: (projectId: string) =>
    path.join(WORKSPACE_PRIVATE_DIR, "projects", projectId, "cache"),

  temp: (projectId: string) =>
    path.join(WORKSPACE_PRIVATE_DIR, "projects", projectId, "temp"),

  takeMeta: (
    projectId: string,
    episodeId: string,
    sceneId: string,
    shotId: string,
    takeId: string
  ) =>
    path.join(
      WORKSPACE_PRIVATE_DIR,
      "projects",
      projectId,
      "episodes",
      episodeId,
      "scenes",
      sceneId,
      "shots",
      shotId,
      "takes",
      takeId
    ),
};

// ─── URL 路径生成（用于 HTTP 访问） ────────────────────────────────────────────

export const urls = {
  take: (
    projectId: string,
    episodeId: string,
    sceneId: string,
    shotId: string,
    takeId: string,
    filename: string
  ) =>
    `${WORKSPACE_URL_PREFIX}/projects/${projectId}/episodes/${episodeId}/scenes/${sceneId}/shots/${shotId}/takes/${takeId}/${filename}`,

  characterAsset: (
    projectId: string,
    characterId: string,
    type: string,
    filename: string
  ) =>
    `${WORKSPACE_URL_PREFIX}/projects/${projectId}/characters/${characterId}/${type}/${filename}`,
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function toAbsolutePublicPath(publicUrl: string | null | undefined) {
  if (!publicUrl) return null;
  if (publicUrl.startsWith(WORKSPACE_URL_PREFIX)) {
    const normalized = publicUrl.slice(WORKSPACE_URL_PREFIX.length).replace(/^\/+/, "");
    return path.join(WORKSPACE_PUBLIC_DIR, normalized);
  }
  const normalized = publicUrl.startsWith("/") ? publicUrl.slice(1) : publicUrl;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", normalized);
}

export function toAbsolutePublicUrl(publicUrl: string | null | undefined) {
  if (!publicUrl) return null;
  if (/^https?:\/\//.test(publicUrl)) return publicUrl;
  const baseUrl =
    process.env.APP_BASE_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_APP_BASE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  return `${baseUrl}${publicUrl.startsWith("/") ? publicUrl : `/${publicUrl}`}`;
}

export function removeFileIfExists(targetPath: string | null | undefined) {
  if (!targetPath) return false;
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { force: true });
    return true;
  }
  return false;
}

export function removePublicUrlIfExists(publicUrl: string | null | undefined) {
  return removeFileIfExists(toAbsolutePublicPath(publicUrl));
}

export function removeDirIfExists(targetPath: string | null | undefined) {
  if (!targetPath) return false;
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

export function initProjectDirs(projectId: string) {
  ensureDir(paths.project(projectId));
  ensureDir(paths.cache(projectId));
  ensureDir(paths.temp(projectId));
}

export function initCharacterDirs(projectId: string, characterId: string) {
  const base = paths.character(projectId, characterId);
  ensureDir(path.join(base, "refs"));
  ensureDir(path.join(base, "angles"));
  ensureDir(path.join(base, "expressions"));
  ensureDir(path.join(base, "wardrobe"));
}

export function initTakeDirs(
  projectId: string,
  episodeId: string,
  sceneId: string,
  shotId: string,
  takeId: string
) {
  ensureDir(paths.take(projectId, episodeId, sceneId, shotId, takeId));
}

export function initExportDirs(projectId: string, episodeId: string) {
  ensureDir(paths.exports(projectId, episodeId));
}

export function removeProjectAssetDirs(projectId: string) {
  removeDirIfExists(paths.project(projectId));
}

export function removeCharacterAssetDirs(projectId: string, characterId: string) {
  removeDirIfExists(paths.character(projectId, characterId));
}

// ─── 资产下载 / 保存 ──────────────────────────────────────────────────────────

export async function downloadToTake(
  url: string,
  projectId: string,
  episodeId: string,
  sceneId: string,
  shotId: string,
  takeId: string,
  filename: string
): Promise<{ localPath: string; url: string }> {
  const dir = paths.take(projectId, episodeId, sceneId, shotId, takeId);
  ensureDir(dir);
  const destPath = path.join(dir, filename);
  const response = await axios({ url, responseType: "stream" });

  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    (response.data as NodeJS.ReadableStream).pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return {
    localPath: destPath,
    url: urls.take(projectId, episodeId, sceneId, shotId, takeId, filename),
  };
}

export function saveBase64ToTake(
  base64: string,
  projectId: string,
  episodeId: string,
  sceneId: string,
  shotId: string,
  takeId: string,
  filename: string
): { localPath: string; url: string } {
  const dir = paths.take(projectId, episodeId, sceneId, shotId, takeId);
  ensureDir(dir);
  const destPath = path.join(dir, filename);
  fs.writeFileSync(destPath, Buffer.from(base64, "base64"));
  return {
    localPath: destPath,
    url: urls.take(projectId, episodeId, sceneId, shotId, takeId, filename),
  };
}

export async function downloadCharacterAsset(
  url: string,
  projectId: string,
  characterId: string,
  type: "refs" | "angles" | "expressions" | "wardrobe",
  filename: string
): Promise<{ localPath: string; url: string }> {
  initCharacterDirs(projectId, characterId);
  const destPath = paths.characterAsset(projectId, characterId, type, filename);
  const response = await axios({ url, responseType: "stream" });

  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    (response.data as NodeJS.ReadableStream).pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return {
    localPath: destPath,
    url: urls.characterAsset(projectId, characterId, type, filename),
  };
}

export function saveBase64ToCharacterAsset(
  base64: string,
  projectId: string,
  characterId: string,
  type: "refs" | "angles" | "expressions" | "wardrobe",
  filename: string
): { localPath: string; url: string } {
  initCharacterDirs(projectId, characterId);
  const destPath = paths.characterAsset(projectId, characterId, type, filename);
  fs.writeFileSync(destPath, Buffer.from(base64, "base64"));
  return {
    localPath: destPath,
    url: urls.characterAsset(projectId, characterId, type, filename),
  };
}

export function saveBufferToCharacterAsset(
  buffer: Buffer,
  projectId: string,
  characterId: string,
  type: "refs" | "angles" | "expressions" | "wardrobe",
  filename: string
): { localPath: string; url: string } {
  initCharacterDirs(projectId, characterId);
  const destPath = paths.characterAsset(projectId, characterId, type, filename);
  fs.writeFileSync(destPath, buffer);
  return {
    localPath: destPath,
    url: urls.characterAsset(projectId, characterId, type, filename),
  };
}

export function saveTakeInputJson(
  projectId: string,
  episodeId: string,
  sceneId: string,
  shotId: string,
  takeId: string,
  input: unknown
) {
  const dir = paths.takeMeta(projectId, episodeId, sceneId, shotId, takeId);
  ensureDir(dir);
  fs.writeFileSync(
    path.join(dir, "input.json"),
    JSON.stringify(input, null, 2)
  );
}

export function saveTakeReviewJson(
  projectId: string,
  episodeId: string,
  sceneId: string,
  shotId: string,
  takeId: string,
  review: unknown
) {
  const dir = paths.takeMeta(projectId, episodeId, sceneId, shotId, takeId);
  ensureDir(dir);
  fs.writeFileSync(
    path.join(dir, "review.json"),
    JSON.stringify(review, null, 2)
  );
}

export function getLocalPath(relativePath: string): string {
  const resolved = toAbsolutePublicPath(relativePath);
  if (!resolved) {
    throw new Error(`Unable to resolve local path for ${relativePath}`);
  }
  return resolved;
}
