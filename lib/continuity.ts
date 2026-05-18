import { prisma } from "@/lib/prisma";

export interface ContinuityContext {
  previousShotId: string | null;
  previousAdoptedImageTakeId: string | null;
  previousAdoptedVideoTakeId: string | null;
  referenceAssetUrls: string[];
  summary: string;
}

export async function buildContinuityContext(input: {
  shotId: string;
  sceneId: string;
  shotOrder: number;
}) {
  const previousShot = await prisma.shot.findFirst({
    where: {
      sceneId: input.sceneId,
      shotOrder: { lt: input.shotOrder },
      id: { not: input.shotId },
    },
    orderBy: { shotOrder: "desc" },
    select: {
      id: true,
      actionDesc: true,
      emotionGoal: true,
      cameraMotion: true,
      cameraAngle: true,
      shotType: true,
      adoptedImageTakeId: true,
      adoptedVideoTakeId: true,
    },
  });

  if (!previousShot) {
    return {
      previousShotId: null,
      previousAdoptedImageTakeId: null,
      previousAdoptedVideoTakeId: null,
      referenceAssetUrls: [],
      summary: "",
    } satisfies ContinuityContext;
  }

  const adoptedTakeIds = [
    previousShot.adoptedImageTakeId,
    previousShot.adoptedVideoTakeId,
  ].filter(Boolean) as string[];

  const adoptedTakes =
    adoptedTakeIds.length > 0
      ? await prisma.take.findMany({
          where: { id: { in: adoptedTakeIds } },
          select: {
            id: true,
            localImage: true,
            localVideo: true,
          },
        })
      : [];

  const referenceAssetUrls = adoptedTakes
    .flatMap((take) => [take.localImage, take.localVideo])
    .filter(Boolean) as string[];

  const summaryParts = [
    previousShot.shotType ? `previous shot type=${previousShot.shotType}` : "",
    previousShot.cameraAngle
      ? `previous camera angle=${previousShot.cameraAngle}`
      : "",
    previousShot.cameraMotion
      ? `previous camera motion=${previousShot.cameraMotion}`
      : "",
    previousShot.emotionGoal
      ? `carry emotion=${previousShot.emotionGoal}`
      : "",
    previousShot.actionDesc
      ? `continue action=${previousShot.actionDesc}`
      : "",
  ].filter(Boolean);

  return {
    previousShotId: previousShot.id,
    previousAdoptedImageTakeId: previousShot.adoptedImageTakeId,
    previousAdoptedVideoTakeId: previousShot.adoptedVideoTakeId,
    referenceAssetUrls,
    summary: summaryParts.join("; "),
  } satisfies ContinuityContext;
}
