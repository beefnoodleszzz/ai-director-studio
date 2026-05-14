/**
 * 漫剧导出引擎
 *
 * 使用 Sharp 将渲染描述转换为实际图像。
 * 每一页生成一张 JPG 图片，最终可合并为竖版长图。
 *
 * 气泡渲染：由于 Sharp 不原生支持文字，使用 SVG overlay 方式。
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";
import { toPixelRect } from "./layout-engine";
import type { RenderedPage, BubbleSpec } from "./layout-engine";

export interface MangaExportOptions {
  outputDir: string;
  pageWidth?: number;
  pageHeight?: number;
  backgroundColor?: string;
  quality?: number;          // JPEG 质量 1-100
  gapPx?: number;            // 格子间距像素
}

export interface MangaPageResult {
  pageIndex: number;
  outputPath: string;
  width: number;
  height: number;
}

const DEFAULT_OPTS = {
  pageWidth: 828,
  pageHeight: 1472,
  backgroundColor: "#ffffff",
  quality: 88,
  gapPx: 4,
};

/**
 * 渲染单页漫剧
 */
export async function renderMangaPage(
  page: RenderedPage,
  opts: MangaExportOptions
): Promise<MangaPageResult> {
  const {
    pageWidth = DEFAULT_OPTS.pageWidth,
    pageHeight = DEFAULT_OPTS.pageHeight,
    backgroundColor = DEFAULT_OPTS.backgroundColor,
    quality = DEFAULT_OPTS.quality,
    gapPx = DEFAULT_OPTS.gapPx,
  } = opts;

  // 底板
  let canvas = sharp({
    create: {
      width: pageWidth,
      height: pageHeight,
      channels: 3,
      background: backgroundColor,
    },
  });

  const compositeInputs: sharp.OverlayOptions[] = [];

  for (const renderedCell of page.cells) {
    const { cell, shot, bubbles } = renderedCell;
    const rect = toPixelRect(cell, pageWidth, pageHeight, gapPx);

    // 绘制图像格子
    if (shot.imagePath && fs.existsSync(shot.imagePath)) {
      try {
        const imgBuffer = await sharp(shot.imagePath)
          .resize(rect.w, rect.h, { fit: "cover", position: "top" })
          .jpeg({ quality: 90 })
          .toBuffer();

        compositeInputs.push({
          input: imgBuffer,
          left: rect.x,
          top: rect.y,
        });
      } catch {
        // 图像读取失败时用占位灰色块
        const placeholder = await sharp({
          create: {
            width: rect.w,
            height: rect.h,
            channels: 3,
            background: "#e5e5e5",
          },
        })
          .jpeg()
          .toBuffer();

        compositeInputs.push({ input: placeholder, left: rect.x, top: rect.y });
      }
    }

    // 格子边框 SVG
    const borderSvg = `<svg width="${rect.w}" height="${rect.h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${rect.w}" height="${rect.h}" fill="none" stroke="#333" stroke-width="2"/>
    </svg>`;
    compositeInputs.push({
      input: Buffer.from(borderSvg),
      left: rect.x,
      top: rect.y,
    });

    // 对白气泡 SVG
    for (const bubble of bubbles) {
      const bubbleSvg = createBubbleSvg(bubble, rect.w, rect.h);
      if (bubbleSvg) {
        compositeInputs.push({
          input: Buffer.from(bubbleSvg),
          left: rect.x,
          top: rect.y,
        });
      }
    }
  }

  if (compositeInputs.length > 0) {
    canvas = sharp(await canvas.jpeg({ quality: 95 }).toBuffer()).composite(compositeInputs);
  }

  const outputPath = path.join(opts.outputDir, `page-${String(page.pageIndex + 1).padStart(3, "0")}.jpg`);
  await canvas.jpeg({ quality }).toFile(outputPath);

  return { pageIndex: page.pageIndex, outputPath, width: pageWidth, height: pageHeight };
}

/**
 * 批量渲染所有页面
 */
export async function renderMangaPages(
  pages: RenderedPage[],
  opts: MangaExportOptions
): Promise<MangaPageResult[]> {
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const results: MangaPageResult[] = [];
  for (const page of pages) {
    const result = await renderMangaPage(page, opts);
    results.push(result);
  }
  return results;
}

/**
 * 将多页图合并为竖版长图
 */
export async function mergePagesToLongStrip(
  pageResults: MangaPageResult[],
  outputPath: string,
  quality = 85
): Promise<string> {
  if (pageResults.length === 0) throw new Error("No pages to merge");

  const totalHeight = pageResults.reduce((acc, p) => acc + p.height, 0);
  const pageWidth = pageResults[0].width;

  const compositeInputs: sharp.OverlayOptions[] = [];
  let yOffset = 0;

  for (const page of pageResults) {
    compositeInputs.push({
      input: page.outputPath,
      left: 0,
      top: yOffset,
    });
    yOffset += page.height;
  }

  await sharp({
    create: {
      width: pageWidth,
      height: totalHeight,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(compositeInputs)
    .jpeg({ quality })
    .toFile(outputPath);

  return outputPath;
}

// ─── 气泡 SVG 生成 ────────────────────────────────────────────────────────────

// ─── 气泡样式工厂 ─────────────────────────────────────────────────────────────

function createBubbleSvg(
  bubble: BubbleSpec,
  cellW: number,
  cellH: number
): string | null {
  if (!bubble.text.trim()) return null;

  switch (bubble.type) {
    case "dialogue":
      return createDialogueBubble(bubble, cellW, cellH);
    case "narration":
      return createNarrationBox(bubble, cellW, cellH);
    case "sfx":
      return createSfxText(bubble, cellW, cellH);
    default:
      return createDialogueBubble(bubble, cellW, cellH);
  }
}

/** 对白气泡：椭圆/圆角矩形，白底黑边 */
function createDialogueBubble(bubble: BubbleSpec, cellW: number, cellH: number): string {
  const cx = bubble.anchorX * cellW;
  const cy = bubble.anchorY * cellH;
  const maxW = Math.min(bubble.maxWidth, cellW * 0.85);
  const fontSize = cellW < 200 ? 11 : 15;
  const padding = 8;

  const text = bubble.text.length > 40 ? bubble.text.slice(0, 37) + "…" : bubble.text;
  const bubbleW = Math.min(maxW, text.length * fontSize * 0.55 + padding * 2);
  const bubbleH = fontSize + padding * 2 + 6;

  const bx = Math.max(4, Math.min(cx - bubbleW / 2, cellW - bubbleW - 4));
  const by = Math.max(4, Math.min(cy - bubbleH / 2, cellH - bubbleH - 4));

  // 角色名标签
  const nameTag = bubble.characterName
    ? `<rect x="${bx}" y="${by - 16}" width="${Math.min(bubble.characterName.length * 8 + 8, 80)}" height="16"
          rx="3" fill="#1a1a2e" fill-opacity="0.85"/>
       <text x="${bx + 4}" y="${by - 4}" font-size="10" font-family="sans-serif" fill="white">${escapeXml(bubble.characterName)}</text>`
    : "";

  // 气泡尾巴（指向画面中心）
  const tailX = cx;
  const tailY = by + bubbleH;
  const tailPoints = `${tailX - 5},${tailY} ${tailX + 5},${tailY} ${tailX},${Math.min(tailY + 12, cellH - 4)}`;

  return `<svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
    ${nameTag}
    <polygon points="${tailPoints}" fill="white" stroke="#222" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="${bx}" y="${by}" width="${bubbleW}" height="${bubbleH}"
      rx="10" ry="10" fill="white" fill-opacity="0.95" stroke="#222" stroke-width="1.5"/>
    <text x="${bx + bubbleW / 2}" y="${by + bubbleH / 2 + fontSize * 0.35}"
      text-anchor="middle" font-size="${fontSize}" font-family="serif" fill="#111">${escapeXml(text)}</text>
  </svg>`;
}

/** 旁白框：矩形，黑底白字，边角不圆 */
function createNarrationBox(bubble: BubbleSpec, cellW: number, cellH: number): string {
  const maxW = Math.min(bubble.maxWidth, cellW * 0.9);
  const fontSize = cellW < 200 ? 10 : 13;
  const padding = 6;

  const text = bubble.text.length > 50 ? bubble.text.slice(0, 47) + "…" : bubble.text;
  const boxW = Math.min(maxW, text.length * fontSize * 0.55 + padding * 2);
  const boxH = fontSize + padding * 2;

  // 旁白框放在格子顶部
  const bx = Math.max(4, (cellW - boxW) / 2);
  const by = 4;

  return `<svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}"
      fill="#1a1a2e" fill-opacity="0.88" stroke="#444" stroke-width="1"/>
    <text x="${bx + boxW / 2}" y="${by + boxH / 2 + fontSize * 0.35}"
      text-anchor="middle" font-size="${fontSize}" font-family="serif" fill="#f0f0f0" font-style="italic">${escapeXml(text)}</text>
  </svg>`;
}

/** 拟声字：大字倾斜，鲜艳红色/黄色，无边框 */
function createSfxText(bubble: BubbleSpec, cellW: number, cellH: number): string {
  const cx = bubble.anchorX * cellW;
  const cy = bubble.anchorY * cellH;
  const fontSize = Math.max(20, Math.min(cellW * 0.18, 40));

  const text = bubble.text.length > 8 ? bubble.text.slice(0, 8) : bubble.text;

  return `<svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
    <text x="${cx}" y="${cy}"
      text-anchor="middle" dominant-baseline="central"
      font-size="${fontSize}" font-family="serif" font-weight="bold"
      fill="#ff3333" stroke="#fff" stroke-width="2"
      transform="rotate(-15, ${cx}, ${cy})"
      opacity="0.9">${escapeXml(text)}</text>
  </svg>`;
}

/** 章节标题：上方大标题 + 副标题 */
export function createChapterTitleSvg(
  title: string,
  subtitle: string,
  pageW: number,
  pageH: number
): string {
  const fontSize = Math.max(28, Math.min(pageW * 0.07, 56));
  const subFontSize = Math.round(fontSize * 0.45);
  const titleY = Math.round(pageH * 0.06);

  return `<svg width="${pageW}" height="${pageH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${pageW}" height="${titleY + fontSize + 12}"
      fill="#1a1a2e" fill-opacity="0.75"/>
    <text x="${pageW / 2}" y="${titleY + fontSize * 0.8}"
      text-anchor="middle" font-size="${fontSize}" font-family="serif" font-weight="bold"
      fill="#ffffff" letter-spacing="3">${escapeXml(title)}</text>
    ${subtitle ? `<text x="${pageW / 2}" y="${titleY + fontSize + subFontSize + 6}"
      text-anchor="middle" font-size="${subFontSize}" font-family="serif"
      fill="#cccccc" letter-spacing="1">${escapeXml(subtitle)}</text>` : ""}
  </svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
