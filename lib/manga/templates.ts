/**
 * 漫剧格子模板定义
 *
 * 每种模板描述一个页面内格子的布局。格子坐标使用归一化值（0-1）。
 * 实际渲染时乘以页面宽高像素值。
 */

export interface GridCell {
  x: number;       // 0-1 左边缘
  y: number;       // 0-1 上边缘
  w: number;       // 0-1 宽度
  h: number;       // 0-1 高度
  emphasis?: boolean; // 是否为强调格（放大镜头用）
}

export interface MangaTemplate {
  id: string;
  name: string;
  description: string;
  shotsPerPage: number;  // 建议每页镜头数
  cells: GridCell[];
}

export const MANGA_TEMPLATES: MangaTemplate[] = [
  {
    id: "single",
    name: "单格全版",
    description: "整页一个镜头，适合强情绪爆点",
    shotsPerPage: 1,
    cells: [{ x: 0, y: 0, w: 1, h: 1, emphasis: true }],
  },
  {
    id: "two-equal",
    name: "上下等分",
    description: "两个等宽镜头上下排列",
    shotsPerPage: 2,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: "three-row",
    name: "三横等分",
    description: "三个镜头等高横排",
    shotsPerPage: 3,
    cells: [
      { x: 0, y: 0,     w: 1, h: 0.333 },
      { x: 0, y: 0.333, w: 1, h: 0.333 },
      { x: 0, y: 0.666, w: 1, h: 0.334 },
    ],
  },
  {
    id: "hero-plus-two",
    name: "主镜头+双格",
    description: "上半页主镜头，下半页左右两格",
    shotsPerPage: 3,
    cells: [
      { x: 0,   y: 0,    w: 1,   h: 0.55, emphasis: true },
      { x: 0,   y: 0.55, w: 0.5, h: 0.45 },
      { x: 0.5, y: 0.55, w: 0.5, h: 0.45 },
    ],
  },
  {
    id: "two-plus-hero",
    name: "双格+主镜头",
    description: "上半页左右两格，下半页主镜头",
    shotsPerPage: 3,
    cells: [
      { x: 0,   y: 0,    w: 0.5, h: 0.45 },
      { x: 0.5, y: 0,    w: 0.5, h: 0.45 },
      { x: 0,   y: 0.45, w: 1,   h: 0.55, emphasis: true },
    ],
  },
  {
    id: "four-grid",
    name: "四格均等",
    description: "2x2 网格，节奏均匀",
    shotsPerPage: 4,
    cells: [
      { x: 0,   y: 0,    w: 0.5, h: 0.5 },
      { x: 0.5, y: 0,    w: 0.5, h: 0.5 },
      { x: 0,   y: 0.5,  w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5,  w: 0.5, h: 0.5 },
    ],
  },
  {
    id: "dynamic-five",
    name: "动感五格",
    description: "左侧竖排两格 + 右侧三格，视觉动感",
    shotsPerPage: 5,
    cells: [
      { x: 0,    y: 0,     w: 0.4,  h: 0.5 },
      { x: 0,    y: 0.5,   w: 0.4,  h: 0.5 },
      { x: 0.4,  y: 0,     w: 0.6,  h: 0.35, emphasis: true },
      { x: 0.4,  y: 0.35,  w: 0.6,  h: 0.33 },
      { x: 0.4,  y: 0.68,  w: 0.6,  h: 0.32 },
    ],
  },
  {
    id: "chapter-cover",
    name: "章节封面",
    description: "大图+章节标题区，适合新章节开始页",
    shotsPerPage: 1,
    cells: [{ x: 0, y: 0.12, w: 1, h: 0.75, emphasis: true }],
  },
];

export function getTemplate(id: string): MangaTemplate {
  return MANGA_TEMPLATES.find((t) => t.id === id) ?? MANGA_TEMPLATES[0];
}
