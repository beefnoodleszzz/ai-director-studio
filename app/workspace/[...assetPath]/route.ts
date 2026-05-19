import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { WORKSPACE_PUBLIC_DIR } from "@/lib/asset";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".json": "application/json; charset=utf-8",
};

function canServeWorkspaceAsset(relativePath: string) {
  const ext = path.extname(relativePath).toLowerCase();
  if (!MIME_TYPES[ext]) return false;

  if (ext !== ".json") return true;

  return (
    relativePath.includes("/exports/") ||
    relativePath.endsWith("/manifest.json") ||
    path.basename(relativePath).startsWith("manifest_")
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assetPath: string[] }> }
) {
  const { assetPath } = await params;
  const relativePath = assetPath.join("/");

  if (!relativePath || !canServeWorkspaceAsset(relativePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const absolutePath = path.resolve(WORKSPACE_PUBLIC_DIR, relativePath);
  const normalizedRoot = `${path.resolve(WORKSPACE_PUBLIC_DIR)}${path.sep}`;

  if (!absolutePath.startsWith(normalizedRoot) && absolutePath !== path.resolve(WORKSPACE_PUBLIC_DIR)) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return serveFile(absolutePath);
}

function serveFile(absolutePath: string) {
  const ext = path.extname(absolutePath).toLowerCase();
  const stream = Readable.toWeb(fs.createReadStream(absolutePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": ext === ".json" ? "no-store" : "private, max-age=3600",
    },
  });
}
