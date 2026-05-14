import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const records = await prisma.exportRecord.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(records);
  } catch (err) {
    console.error("[GET /api/projects/:id/exports]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
