/**
 * 漫剧长图导出
 * 将每个分镜的图片 + 对话气泡拼接为小红书竖版长图（PNG）
 * 使用 sharp 进行服务端图片合成
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const { episodeId } = (await req.json()) as { episodeId: string };
    if (!episodeId) {
      return NextResponse.json({ error: "episodeId required" }, { status: 400 });
    }

    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: { scenes: { orderBy: { sceneOrder: "asc" } } },
    });
    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    // 懒加载 sharp（不影响其他路由的冷启动）
    let sharp: typeof import("sharp");
    try {
      sharp = (await import("sharp")).default as unknown as typeof import("sharp");
    } catch {
      return NextResponse.json(
        {
          error:
            "sharp is not installed. Run: pnpm add sharp",
        },
        { status: 500 }
      );
    }

    const WIDTH = 1080;
    const FRAME_HEIGHT = 1080; // 每帧高度（正方形）
    const BUBBLE_HEIGHT = 160;  // 对话气泡区域高度
    const CARD_HEIGHT = FRAME_HEIGHT + BUBBLE_HEIGHT;

    const scenes = episode.scenes.filter((s) => s.localImage);
    if (scenes.length === 0) {
      return NextResponse.json({ error: "No scenes with images" }, { status: 400 });
    }

    const totalHeight = CARD_HEIGHT * scenes.length;

    // 创建白色底版
    const canvas = sharp({
      create: { width: WIDTH, height: totalHeight, channels: 4, background: "#0a0a0f" },
    });

    const compositeInputs: import("sharp").OverlayOptions[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const yOffset = i * CARD_HEIGHT;

      if (scene.localImage) {
        const imgAbsPath = path.join(process.cwd(), "public", scene.localImage);
        if (fs.existsSync(imgAbsPath)) {
          const resized = await sharp(imgAbsPath)
            .resize(WIDTH, FRAME_HEIGHT, { fit: "cover" })
            .toBuffer();
          compositeInputs.push({ input: resized, top: yOffset, left: 0 });
        }
      }

      // 对话气泡：SVG 文字层
      if (scene.dialogue) {
        const truncated = scene.dialogue.length > 60
          ? scene.dialogue.slice(0, 57) + "…"
          : scene.dialogue;
        const svgText = `
          <svg width="${WIDTH}" height="${BUBBLE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${WIDTH}" height="${BUBBLE_HEIGHT}" fill="#0a0a0f" opacity="0.9"/>
            <text 
              x="50%" y="50%" 
              dominant-baseline="middle" text-anchor="middle"
              font-family="PingFang SC, Noto Sans CJK SC, sans-serif"
              font-size="32" fill="#FFFAF0" 
              xml:space="preserve"
            >${escapeXml(truncated)}</text>
          </svg>`;
        compositeInputs.push({
          input: Buffer.from(svgText),
          top: yOffset + FRAME_HEIGHT,
          left: 0,
        });
      }

      // 镜头编号角标
      const indexSvg = `
        <svg width="80" height="36" xmlns="http://www.w3.org/2000/svg">
          <rect width="80" height="36" rx="6" fill="#c0a060" opacity="0.9"/>
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
            font-family="monospace" font-size="18" fill="#0a0a0f" font-weight="bold"
          >#${String(i + 1).padStart(2, "0")}</text>
        </svg>`;
      compositeInputs.push({
        input: Buffer.from(indexSvg),
        top: yOffset + 12,
        left: 12,
      });
    }

    const outputDir = path.join(process.cwd(), "public", "workspace", "output");
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = `manga_${episodeId}_${Date.now()}.png`;
    const outputPath = path.join(outputDir, filename);
    const publicPath = `/workspace/output/${filename}`;

    await canvas.composite(compositeInputs).png({ compressionLevel: 6 }).toFile(outputPath);

    return NextResponse.json({ outputPath: publicPath });
  } catch (err) {
    console.error("[export/manga]", err);
    return NextResponse.json({ error: "Manga export failed" }, { status: 500 });
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
