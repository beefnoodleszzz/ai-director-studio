/**
 * 角色跨集一致性报告
 *
 * 通过分析已有 Review 中的 failTags，识别每个角色在哪些镜头出现了
 * face-consistency / wardrobe-drift 等问题，生成跨集稳定性报告。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONSISTENCY_TAG_CODES } from "@/lib/qa-tags";

export interface CharacterConsistencyReport {
  characterId: string;
  characterName: string;
  totalShots: number;          // 出现的镜头数
  totalTakes: number;          // 生成的 take 数
  consistencyIssues: number;   // 面部/服装不一致的 take 数
  consistencyRate: number;     // 一致率 0-100
  recentIssues: IssueEntry[];
}

export interface IssueEntry {
  episodeNum: number;
  sceneOrder: number;
  shotOrder: number;
  takeId: string;
  failTags: string[];
  details: string;
  generatedAt: string;
}

// 使用标准标签字典（统一口径）
const CONSISTENCY_TAGS = CONSISTENCY_TAG_CODES;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // 获取项目所有角色
    const characters = await prisma.characterBible.findMany({
      where: { projectId },
      select: { id: true, name: true },
    });

    const reports: CharacterConsistencyReport[] = [];

    for (const char of characters) {
      // 找到含该角色的所有镜头
      const shots = await prisma.shot.findMany({
        where: {
          subjectCharIds: { contains: char.id },
          scene: { episode: { projectId } },
        },
        include: {
          scene: {
            include: {
              episode: { select: { episodeNum: true } },
            },
          },
          takes: {
            where: { takeType: "image", isDiscarded: false },
            include: {
              reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
            },
            orderBy: { generatedAt: "desc" },
          },
        },
      });

      let totalTakes = 0;
      let consistencyIssues = 0;
      const recentIssues: IssueEntry[] = [];

      for (const shot of shots) {
        for (const take of shot.takes) {
          totalTakes += 1;
          const review = take.reviews[0];
          if (!review) continue;

          const failTags: string[] = review.failTags
            ? JSON.parse(review.failTags)
            : [];

          const hasConsistencyIssue = failTags.some((tag) =>
            CONSISTENCY_TAGS.includes(tag)
          );

          if (hasConsistencyIssue) {
            consistencyIssues += 1;
            if (recentIssues.length < 10) {
              recentIssues.push({
                episodeNum: shot.scene.episode.episodeNum,
                sceneOrder: shot.scene.sceneOrder,
                shotOrder: shot.shotOrder,
                takeId: take.id,
                failTags: failTags.filter((t) => CONSISTENCY_TAGS.includes(t)),
                details: review.details,
                generatedAt: take.generatedAt.toISOString(),
              });
            }
          }
        }
      }

      const consistencyRate =
        totalTakes > 0
          ? Math.round(((totalTakes - consistencyIssues) / totalTakes) * 100)
          : 100;

      reports.push({
        characterId: char.id,
        characterName: char.name,
        totalShots: shots.length,
        totalTakes,
        consistencyIssues,
        consistencyRate,
        recentIssues,
      });
    }

    reports.sort((a, b) => a.consistencyRate - b.consistencyRate);

    return NextResponse.json(reports);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
