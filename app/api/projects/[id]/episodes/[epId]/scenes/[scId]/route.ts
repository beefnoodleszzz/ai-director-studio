import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string; scId: string }> }
) {
  try {
    const { scId } = await params;
    const scene = await prisma.scene.findUnique({
      where: { id: scId },
      include: {
        shots: {
          orderBy: { shotOrder: "asc" },
          include: {
            takes: {
              orderBy: { createdAt: "desc" },
              include: {
                reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(scene);
  } catch (err) {
    console.error("[GET scene]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
