import fs from "fs";
import path from "path";
import axios from "axios";

export const WORKSPACE_DIR = path.join(process.cwd(), "public", "workspace");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function downloadAsset(url: string, filename: string): Promise<string> {
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

export function saveBase64Asset(base64: string, filename: string): string {
  ensureDir(WORKSPACE_DIR);
  const destPath = path.join(WORKSPACE_DIR, filename);
  const buffer = Buffer.from(base64, "base64");
  fs.writeFileSync(destPath, buffer);
  return `/workspace/${filename}`;
}

export function assetExists(relativePath: string): boolean {
  const fullPath = path.join(process.cwd(), "public", relativePath);
  return fs.existsSync(fullPath);
}

export function getLocalPath(relativePath: string): string {
  return path.join(process.cwd(), "public", relativePath);
}
