/**
 * 漫剧导出 API
 *
 * 接收剧集 ID + 模板配置，使用漫剧模板系统渲染分页图片并合并为竖版长图。
 * 导出结果写入 ExportRecord 并返回输出路径。
 */
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { paths, initExportDirs, getLocalPath, WORKSPACE_URL_PREFIX, WORKSPACE_PUBLIC_DIR } from "@/lib/asset";
import { MANGA_TEMPLATES } from "@/lib/manga/templates";
import { assignShotsToPages } from "@/lib/manga/layout-engine";
import { renderMangaPages, mergePagesToLongStrip } from "@/lib/manga/export";
import type { ShotRenderData } from "@/lib/manga/layout-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      projectId: string;
      episodeId: string;
      templateId?: string;
      shotsPerPage?: number;
      pageWidth?: number;
      pageHeight?: number;
      quality?: number;
      mergeLongStrip?: boolean;
    };

    const {
      projectId,
      episodeId,
      templateId = "hero-plus-two",
      pageWidth = 828,
      pageHeight = 1472,
      quality = 88,
      mergeLongStrip = true,
    } = body;

    if (!projectId || !episodeId) {
      return NextResponse.json({ error: "projectId and episodeId required" }, { status: 400 });
    }

    // 确认剧集存在
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        scenes: {
          orderBy: { sceneOrder: "asc" },
          include: {
            shots: {
              orderBy: { shotOrder: "asc" },
              include: {
                takes: {
                  where: { takeType: "image", isAdopted: true },
                  take: 1,
                },
              },
            },
          },
        },
        project: {
          include: { characters: { select: { id: true, name: true } } },
        },
      },
    });

    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    // 构建角色 ID → 名字映射
    const charMap = new Map(episode.project.characters.map((c) => [c.id, c.name]));

    // 收集所有有采用 take 的镜头
    const shotDataList: ShotRenderData[] = [];

    for (const scene of episode.scenes) {
      for (const shot of scene.shots) {
        const adoptedTake = shot.takes[0];
        if (!adoptedTake?.localImage) continue;

        // 从 URL 转换为绝对路径
        const imagePath = getLocalPath(adoptedTake.localImage);

        // 取第一个主体角色名
        const subjectIds: string[] = shot.subjectCharIds
          ? JSON.parse(shot.subjectCharIds)
          : [];
        const characterName = charMap.get(subjectIds[0]) ?? "";

        shotDataList.push({
          shotId: shot.id,
          imagePath,
          dialogue: shot.dialogue ?? "",
          characterName,
          shotType: shot.shotType ?? "",
          isEmphasis: shot.shotType === "ECU" || shot.shotType === "LS" || shot.shotType === "ELS",
        });
      }
    }

    if (shotDataList.length === 0) {
      return NextResponse.json({ error: "No adopted image takes found for this episode" }, { status: 422 });
    }

    // 初始化导出目录
    initExportDirs(projectId, episodeId);
    const exportDir = paths.exports(projectId, episodeId);
    const timestamp = Date.now();
    const pageOutputDir = path.join(exportDir, `manga-${timestamp}`);

    // 布局分配
    const pages = assignShotsToPages(shotDataList, templateId, pageWidth);

    // 渲染所有页
    const pageResults = await renderMangaPages(pages, {
      outputDir: pageOutputDir,
      pageWidth,
      pageHeight,
      quality,
    });

    // 合并为长图
    let longStripPath: string | null = null;
    if (mergeLongStrip && pageResults.length > 0) {
      longStripPath = path.join(exportDir, `manga-${timestamp}-longstrip.jpg`);
      await mergePagesToLongStrip(pageResults, longStripPath, quality);
    }

    const relativeLongStripPath = longStripPath
      ? `${WORKSPACE_URL_PREFIX}/${path.relative(WORKSPACE_PUBLIC_DIR, longStripPath).replace(/\\/g, "/")}`
      : null;

    // manifest
    const manifest = {
      type: "manga",
      templateId,
      episodeId,
      totalPages: pageResults.length,
      totalShots: shotDataList.length,
      pageWidth,
      pageHeight,
      longStripPath: relativeLongStripPath,
      pages: pageResults.map((p) => ({
        pageIndex: p.pageIndex,
        path: `${WORKSPACE_URL_PREFIX}/${path.relative(WORKSPACE_PUBLIC_DIR, p.outputPath).replace(/\\/g, "/")}`,
      })),
    };

    const manifestPath = path.join(pageOutputDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const relativeManifestPath = `${WORKSPACE_URL_PREFIX}/${path.relative(WORKSPACE_PUBLIC_DIR, manifestPath).replace(/\\/g, "/")}`;

    // 写入 ExportRecord
    const record = await prisma.exportRecord.create({
      data: {
        projectId,
        episodeId,
        exportType: "manga",
        outputPath: relativeLongStripPath ?? "",
        manifestPath: relativeManifestPath,
        totalShots: shotDataList.length,
        duration: 0,
        exportedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      exportRecordId: record.id,
      totalPages: pageResults.length,
      totalShots: shotDataList.length,
      longStripUrl: relativeLongStripPath,
      manifestUrl: relativeManifestPath,
    });
  } catch (e) {
    console.error("[manga-export]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ templates: MANGA_TEMPLATES });
}
