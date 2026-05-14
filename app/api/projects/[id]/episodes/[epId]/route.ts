import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string }> }
) {
  try {
    const { epId } = await params;
    await prisma.episode.delete({ where: { id: epId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/projects/:id/episodes/:epId]", err);
    return NextResponse.json({ error: "Failed to delete episode" }, { status: 500 });
  }
}
