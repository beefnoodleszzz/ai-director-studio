/**
 * 资产目录管理
 *
 * 目录结构：
 * public/workspace/projects/{projectId}/
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

export const WORKSPACE_DIR = path.join(process.cwd(), "public", "workspace");

// ─── 目录路径生成 ─────────────────────────────────────────────────────────────

export const paths = {
  project: (projectId: string) =>
    path.join(WORKSPACE_DIR, "projects", projectId),

  styleBible: (projectId: string) =>
    path.join(WORKSPACE_DIR, "projects", projectId, "style-bible.json"),

  character: (projectId: string, characterId: string) =>
    path.join(WORKSPACE_DIR, "projects", projectId, "characters", characterId),

  characterAsset: (
    projectId: string,
    characterId: string,
    type: "refs" | "angles" | "expressions" | "wardrobe",
    filename: string
  ) =>
    path.join(
      WORKSPACE_DIR,
      "projects",
      projectId,
      "characters",
      characterId,
      type,
      filename
    ),

  episode: (projectId: string, episodeId: string) =>
    path.join(WORKSPACE_DIR, "projects", projectId, "episodes", episodeId),

  scene: (projectId: string, episodeId: string, sceneId: string) =>
    path.join(
      WORKSPACE_DIR,
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
      WORKSPACE_DIR,
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
      WORKSPACE_DIR,
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
      WORKSPACE_DIR,
      "projects",
      projectId,
      "episodes",
      episodeId,
      "exports"
    ),

  cache: (projectId: string) =>
    path.join(WORKSPACE_DIR, "projects", projectId, "cache"),

  temp: (projectId: string) =>
    path.join(WORKSPACE_DIR, "projects", projectId, "temp"),
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
    `/workspace/projects/${projectId}/episodes/${episodeId}/scenes/${sceneId}/shots/${shotId}/takes/${takeId}/${filename}`,

  characterAsset: (
    projectId: string,
    characterId: string,
    type: string,
    filename: string
  ) =>
    `/workspace/projects/${projectId}/characters/${characterId}/${type}/${filename}`,
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

export function saveTakeInputJson(
  projectId: string,
  episodeId: string,
  sceneId: string,
  shotId: string,
  takeId: string,
  input: unknown
) {
  const dir = paths.take(projectId, episodeId, sceneId, shotId, takeId);
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
  const dir = paths.take(projectId, episodeId, sceneId, shotId, takeId);
  ensureDir(dir);
  fs.writeFileSync(
    path.join(dir, "review.json"),
    JSON.stringify(review, null, 2)
  );
}

// ─── 兼容旧接口（过渡期保留） ──────────────────────────────────────────────────

/** @deprecated 使用 downloadToTake 代替 */
export async function downloadAsset(
  url: string,
  filename: string
): Promise<string> {
  ensureDir(WORKSPACE_DIR);
  const destPath = path.join(WORKSPACE_DIR, filename);
  const response = await axios({ url, responseType: "stream" });

  return new Promise<string>((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    (response.data as NodeJS.ReadableStream).pipe(writer);
    writer.on("finish", () => resolve(`/workspace/${filename}`));
    writer.on("error", reject);
  });
}

/** @deprecated 使用 saveBase64ToTake 代替 */
export function saveBase64Asset(base64: string, filename: string): string {
  ensureDir(WORKSPACE_DIR);
  const destPath = path.join(WORKSPACE_DIR, filename);
  fs.writeFileSync(destPath, Buffer.from(base64, "base64"));
  return `/workspace/${filename}`;
}

export function assetExists(relativePath: string): boolean {
  const fullPath = path.join(process.cwd(), "public", relativePath);
  return fs.existsSync(fullPath);
}

export function getLocalPath(relativePath: string): string {
  return path.join(process.cwd(), "public", relativePath);
}

export function cleanTempDir(projectId: string) {
  const tmpDir = paths.temp(projectId);
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    ensureDir(tmpDir);
  }
}
