import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONSISTENCY_TAG_CODES } from "@/lib/qa-tags";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const [characters, shots, exportRecords] = await Promise.all([
      prisma.characterBible.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          relationshipSummary: true,
          arcSummary: true,
          dramaticGoal: true,
          conflictRole: true,
        },
      }),
      prisma.shot.findMany({
        where: { scene: { episode: { projectId } } },
        include: {
          scene: {
            include: {
              episode: { select: { episodeNum: true } },
            },
          },
          takes: {
            where: { isDiscarded: false },
            include: {
              reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
            },
          },
        },
      }),
      prisma.exportRecord.findMany({
        where: { projectId, exportType: "short-drama" },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

    const relationshipBlindSpots = characters
      .filter((character) => !character.relationshipSummary?.trim() || !character.arcSummary?.trim())
      .map((character) => ({
        characterId: character.id,
        characterName: character.name,
        reason: !character.relationshipSummary?.trim() ? "缺少关系摘要" : "缺少成长弧线",
      }));

    const consistencyIssues = [];
    for (const shot of shots) {
      for (const take of shot.takes) {
        const review = take.reviews[0];
        if (!review) continue;
        const failTags: string[] = review.failTags ? JSON.parse(review.failTags) : [];
        const matched = failTags.filter((tag) => CONSISTENCY_TAG_CODES.includes(tag));
        if (matched.length === 0) continue;
        consistencyIssues.push({
          shotId: shot.id,
          sceneOrder: shot.scene.sceneOrder,
          episodeNum: shot.scene.episode.episodeNum,
          shotOrder: shot.shotOrder,
          tags: matched,
          details: review.details,
        });
      }
    }

    const continuityIssues = [];
    for (const record of exportRecords) {
      if (!record.manifestPath) continue;
      try {
        const fs = await import("fs");
        const manifestLocal = `${process.cwd()}/public${record.manifestPath.startsWith("/") ? record.manifestPath : `/${record.manifestPath}`}`;
        if (!fs.existsSync(manifestLocal)) continue;
        const parsed = JSON.parse(fs.readFileSync(manifestLocal, "utf8")) as {
          preflight?: {
            continuityAudit?: {
              summary?: string;
              issues?: Array<{
                shotId: string;
                sceneId?: string;
                shotOrder: number;
                tags: string[];
                recommendation: string;
              }>;
            };
          };
        };
        for (const issue of parsed.preflight?.continuityAudit?.issues ?? []) {
          continuityIssues.push(issue);
        }
      } catch {
        // noop
      }
    }

    return NextResponse.json({
      relationshipBlindSpots,
      consistencyIssues: consistencyIssues.slice(0, 8),
      continuityIssues: continuityIssues.slice(0, 8),
      rewriteSuggestions: {
        cast:
          relationshipBlindSpots.length > 0
            ? "优先补齐关系摘要和成长弧线，再继续推进剧本和拆解。"
            : "角色关系基础已具备，可进一步强化冲突热区的压迫感。",
        script:
          consistencyIssues.length > 0
            ? "当前剧本可能没有把角色关系和身份锚点压进关键场景，建议重写关键对白与冲突场。"
            : "剧本层对角色一致性的拖累较少，可优先优化节拍和结尾追更感。",
        breakdown:
          continuityIssues.length > 0
            ? "拆解前请检查本集节拍是否存在跳切过大、情绪承接过弱的段落。"
            : "当前拆解前约束基本稳定，可继续强化镜头级节拍控制。",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
