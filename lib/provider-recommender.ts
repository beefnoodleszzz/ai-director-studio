/**
 * Provider 自动推荐系统
 *
 * 基于历史生成统计，为给定的镜头类型/要求推荐最优 provider。
 * 评分维度：通过率（权重 0.5）+ 均分（权重 0.3）+ 速度（权重 0.2）
 */

import { prisma } from "./prisma";

export interface ProviderScore {
  provider: string;
  passRate: number;
  avgScore: number;
  speedScore: number;     // 速度分（越快越高）0-1
  compositeScore: number; // 综合分 0-1
  sampleSize: number;
}

const WEIGHTS = { passRate: 0.5, avgScore: 0.3, speed: 0.2 };
const MAX_GEN_MS = 120_000; // 2min 为参考最慢值

/**
 * 为指定项目 + takeType 推荐最优 provider
 * @param projectId 项目 ID（只使用本项目历史）
 * @param takeType  image | video | audio | sfx
 * @param fallback  历史数据不足时的默认 provider
 */
export async function recommendProvider(
  projectId: string,
  takeType: string,
  fallback = "seedream"
): Promise<{ provider: string; reason: string; scores: ProviderScore[] }> {
  // 取近 200 个该项目 + 该类型的 take
  const takes = await prisma.take.findMany({
    where: {
      takeType,
      shot: { scene: { episode: { projectId } } },
      isDiscarded: false,
    },
    include: {
      reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
    },
    orderBy: { generatedAt: "desc" },
    take: 200,
  });

  if (takes.length < 5) {
    return {
      provider: fallback,
      reason: "历史数据不足，使用默认 provider",
      scores: [],
    };
  }

  // 按 provider 分组
  const providerMap = new Map<
    string,
    { passes: number; scores: number[]; timings: number[] }
  >();

  for (const take of takes) {
    const p = take.provider || "unknown";
    if (!providerMap.has(p)) {
      providerMap.set(p, { passes: 0, scores: [], timings: [] });
    }
    const entry = providerMap.get(p)!;
    entry.scores.push(take.autoScore);
    entry.timings.push(take.generationMs);

    const verdict = take.reviews[0]?.verdict;
    if (verdict === "pass" || verdict === "warn") entry.passes += 1;
  }

  const scores: ProviderScore[] = [];

  for (const [provider, data] of providerMap.entries()) {
    const n = data.scores.length;
    const passRate = data.passes / n;
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / n;
    const avgMs = data.timings.reduce((a, b) => a + b, 0) / n;
    const speedScore = Math.max(0, 1 - avgMs / MAX_GEN_MS);
    const compositeScore =
      passRate * WEIGHTS.passRate +
      avgScore * WEIGHTS.avgScore +
      speedScore * WEIGHTS.speed;

    scores.push({
      provider,
      passRate: Math.round(passRate * 100) / 100,
      avgScore: Math.round(avgScore * 100) / 100,
      speedScore: Math.round(speedScore * 100) / 100,
      compositeScore: Math.round(compositeScore * 100) / 100,
      sampleSize: n,
    });
  }

  scores.sort((a, b) => b.compositeScore - a.compositeScore);
  const best = scores[0];

  // 若最优 provider 和 fallback 分差不大（< 0.05），保守选 fallback
  const fallbackScore = scores.find((s) => s.provider === fallback);
  if (
    fallbackScore &&
    best.compositeScore - fallbackScore.compositeScore < 0.05
  ) {
    return {
      provider: fallback,
      reason: `综合分差距较小（${best.provider}: ${best.compositeScore} vs ${fallback}: ${fallbackScore.compositeScore}），保守使用默认 provider`,
      scores,
    };
  }

  return {
    provider: best.provider,
    reason: `基于 ${best.sampleSize} 个样本，${best.provider} 综合得分最高（通过率 ${Math.round(best.passRate * 100)}%，均分 ${best.avgScore.toFixed(2)}）`,
    scores,
  };
}
