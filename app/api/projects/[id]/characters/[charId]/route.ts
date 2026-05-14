import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { charId } = await params;
    const body = await req.json();
    const { voiceProfile, ...charData } = body;

    const character = await prisma.characterBible.update({
      where: { id: charId },
      data: charData,
      include: { voiceProfile: true, assets: true },
    });

    if (voiceProfile) {
      await prisma.voiceProfile.upsert({
        where: { characterId: charId },
        create: { characterId: charId, ...voiceProfile },
        update: voiceProfile,
      });
    }

    return NextResponse.json(character);
  } catch (err) {
    console.error("[PATCH /api/projects/:id/characters/:charId]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { charId } = await params;
    await prisma.characterBible.delete({ where: { id: charId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE character]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
