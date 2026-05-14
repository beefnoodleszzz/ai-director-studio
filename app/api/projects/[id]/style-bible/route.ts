import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await req.json();
    const bible = await prisma.styleBible.upsert({
      where: { projectId },
      create: { projectId, ...body },
      update: body,
    });
    return NextResponse.json(bible);
  } catch (err) {
    console.error("[POST style-bible]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await req.json();
    const bible = await prisma.styleBible.upsert({
      where: { projectId },
      create: { projectId, ...body },
      update: body,
    });
    return NextResponse.json(bible);
  } catch (err) {
    console.error("[PATCH style-bible]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
