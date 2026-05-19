import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  jsonError,
  parseProjectQaQueryParams,
  validateQaReviewPatchBody,
} from "@/lib/route-validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const parsed = validateQaReviewPatchBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

    const review = await prisma.review.findFirst({
      where: {
        id: body.reviewId,
        take: {
          shot: {
            scene: {
              episode: {
                projectId,
              },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!review) {
      return jsonError(404, "review_not_found", "Review was not found for the current project");
    }

    const updated = await prisma.review.update({
      where: { id: body.reviewId },
      data: {
        ...(body.verdict !== undefined ? { verdict: body.verdict } : {}),
        ...(body.suggestion !== undefined ? { suggestion: body.suggestion } : {}),
        ...(body.details !== undefined ? { details: body.details } : {}),
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
    const parsed = parseProjectQaQueryParams(req.url);
    if (!parsed.ok) {
      return parsed.response;
    }

    const { episodeId } = parsed.value;

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

    const qaItems = [];
    for (const scene of scenes) {
      for (const shot of scene.shots) {
        const adoptedImageTake = shot.takes.find((t) => t.isAdopted && t.takeType === "image");
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
            projectId,
            episodeId: scene.episode.id,
            sceneId: scene.id,
            shotId: shot.id,
            adoptedImageTakeId: adoptedImageTake?.id ?? null,
            visualPrompt: shot.visualPrompt,
            audioPrompt: shot.audioPrompt,
            dialogue: shot.dialogue,
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
