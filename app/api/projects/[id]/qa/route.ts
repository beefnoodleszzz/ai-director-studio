import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest
) {
  try {
    const body = await req.json() as {
      reviewId: string;
      verdict?: string;
      suggestion?: string;
      details?: string;
    };

    if (!body.reviewId) return NextResponse.json({ error: "reviewId required" }, { status: 400 });

    const updated = await prisma.review.update({
      where: { id: body.reviewId },
      data: {
        ...(body.verdict ? { verdict: body.verdict } : {}),
        ...(body.suggestion ? { suggestion: body.suggestion } : {}),
        ...(body.details ? { details: body.details } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(req.url);
    const episodeId = searchParams.get("episodeId");


    const scenes = await prisma.scene.findMany({
      where: {
        episode: {
          projectId,
          ...(episodeId ? { id: episodeId } : {}),
        },
      },
      include: {
        episode: { select: { id: true } },
        shots: {
          include: {
            takes: {
              where: { isDiscarded: false },
              include: {
                reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });

    // 展平为 QA item 列表（携带完整路由上下文供前端重做）
    const qaItems = [];
    for (const scene of scenes) {
      for (const shot of scene.shots) {
        // 找到当前采用的 image take（供视频重做使用）
        const adoptedImageTake = shot.takes.find(
          (t) => t.isAdopted && t.takeType === "image"
        );
        for (const take of shot.takes) {
          const latestReview = take.reviews[0];
          if (!latestReview) continue;
          let paramsSnapshot: Record<string, unknown> | null = null;
          try {
            paramsSnapshot = take.paramsSnapshot ? JSON.parse(take.paramsSnapshot) : null;
          } catch {
            paramsSnapshot = null;
          }
          qaItems.push({
            // 路由上下文（供重做时构建 API 参数）
            projectId,
            episodeId: scene.episode.id,
            sceneId: scene.id,
            shotId: shot.id,
            adoptedImageTakeId: adoptedImageTake?.id ?? null,
            visualPrompt: shot.visualPrompt,
            // 展示字段
            shotOrder: shot.shotOrder,
            shotType: shot.shotType,
            sceneOrder: scene.sceneOrder,
            location: scene.location,
            take: {
              id: take.id,
              takeType: take.takeType,
              provider: take.provider,
              localImage: take.localImage,
              localVideo: take.localVideo,
              autoScore: take.autoScore,
              isAdopted: take.isAdopted,
              paramsSnapshot,
            },
            review: {
              id: latestReview.id,
              reviewType: latestReview.reviewType,
              verdict: latestReview.verdict,
              score: latestReview.score,
              failTags: latestReview.failTags,
              suggestion: latestReview.suggestion,
              details: latestReview.details,
            },
          });
        }
      }
    }

    return NextResponse.json(qaItems);
  } catch (err) {
    console.error("[GET /api/projects/:id/qa]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
