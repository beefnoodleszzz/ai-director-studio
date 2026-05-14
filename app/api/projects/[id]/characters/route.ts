import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { name, prompt, refImageUrl } = await req.json() as {
      name: string;
      prompt: string;
      refImageUrl?: string;
    };

    const character = await prisma.character.create({
      data: { projectId, name, prompt, refImageUrl: refImageUrl ?? "" },
    });

    return NextResponse.json(character, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects/:id/characters]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { characterId } = await req.json() as { characterId: string };
    await prisma.character.deleteMany({ where: { id: characterId, projectId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/projects/:id/characters]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
