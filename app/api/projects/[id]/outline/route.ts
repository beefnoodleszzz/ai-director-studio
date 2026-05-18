import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = (await req.json()) as { storyOutline: unknown };

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        storyOutline: JSON.stringify(body.storyOutline ?? {}),
        productionStage: "outline_ready",
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
