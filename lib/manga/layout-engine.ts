/**
 * 漫剧排版引擎
 *
 * 职责：
 * 1. 将镜头序列按模板分配到页面格子
 * 2. 计算气泡位置（避免遮脸）
 * 3. 输出渲染所需的页面描述对象
 */

import { getTemplate } from "./templates";
import type { GridCell } from "./templates";

export interface ShotRenderData {
  shotId: string;
  imagePath: string;          // 绝对路径
  dialogue: string;
  characterName: string;
  shotType: string;
  isEmphasis: boolean;
}

export interface BubbleSpec {
  type: "dialogue" | "narration" | "sfx" | "chapter-title";
  text: string;
  characterName?: string;
  // 气泡在格子内的相对位置 (0-1)
  anchorX: number;
  anchorY: number;
  maxWidth: number;   // px
}

export interface RenderedCell {
  cell: GridCell;           // 归一化坐标
  shot: ShotRenderData;
  bubbles: BubbleSpec[];
}

export interface RenderedPage {
  pageIndex: number;
  templateId: string;
  cells: RenderedCell[];
  // 章节信息（仅 chapter-cover 使用）
  chapterTitle?: string;
  chapterSubtitle?: string;
}

/**
 * 分配镜头到页面
 */
export function assignShotsToPages(
  shots: ShotRenderData[],
  templateId: string,
  pageWidth = 828,
): RenderedPage[] {
  const template = getTemplate(templateId);
  const pages: RenderedPage[] = [];

  let idx = 0;
  let pageIndex = 0;

  while (idx < shots.length) {
    const pageShots = shots.slice(idx, idx + template.shotsPerPage);
    idx += template.shotsPerPage;

    const cells: RenderedCell[] = pageShots.map((shot, i) => {
      const cell = template.cells[i] ?? template.cells[template.cells.length - 1];
      const bubbles = generateBubbles(shot, cell, pageWidth, !!(shot.isEmphasis || cell.emphasis));
      return { cell, shot, bubbles };
    });

    pages.push({ pageIndex, templateId: template.id, cells });
    pageIndex += 1;
  }

  return pages;
}

/**
 * 为格子内镜头生成气泡规格
 * 策略：对白气泡放在画面下 1/4 区域；若是仰角/俯角镜头则放上方
 */
function generateBubbles(
  shot: ShotRenderData,
  cell: GridCell,
  pageWidth: number,
  isEmphasis: boolean,
): BubbleSpec[] {
  const bubbles: BubbleSpec[] = [];
  const cellPixelWidth = cell.w * pageWidth;

  // 对白气泡
  if (shot.dialogue) {
    // 区分对白（无旁白标记）和旁白（以「旁白:」「[旁白]」等开头）
    const isNarration = /^(旁白[:：]|\[旁白\]|\(旁白\))/i.test(shot.dialogue);
    const cleanText = isNarration ? shot.dialogue.replace(/^(旁白[:：]|\[旁白\]|\(旁白\))\s*/i, "") : shot.dialogue;

    const isLowAngle = shot.shotType.toLowerCase().includes("low");
    const anchorY = isLowAngle ? 0.15 : (isNarration ? 0.08 : 0.78);

    bubbles.push({
      type: isNarration ? "narration" : "dialogue",
      text: cleanText,
      characterName: isNarration ? undefined : shot.characterName,
      anchorX: 0.5,
      anchorY,
      maxWidth: isEmphasis ? cellPixelWidth * 0.7 : cellPixelWidth * 0.88,
    });
  }

  // 拟声字（shotType 为 SFX 或 audio 相关 shot）
  if (shot.shotType === "SFX" || shot.dialogue?.startsWith("[sfx]")) {
    const sfxText = shot.dialogue?.replace(/^\[sfx\]/i, "").trim() || "！！";
    bubbles.push({
      type: "sfx",
      text: sfxText,
      anchorX: 0.75,
      anchorY: 0.25,
      maxWidth: cellPixelWidth * 0.4,
    });
  }

  return bubbles;
}

/**
 * 将归一化坐标转换为像素坐标
 */
export function toPixelRect(
  cell: GridCell,
  pageWidth: number,
  pageHeight: number,
  gapPx = 4,
) {
  return {
    x: Math.round(cell.x * pageWidth) + gapPx,
    y: Math.round(cell.y * pageHeight) + gapPx,
    w: Math.round(cell.w * pageWidth) - gapPx * 2,
    h: Math.round(cell.h * pageHeight) - gapPx * 2,
  };
}
