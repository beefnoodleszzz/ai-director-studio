import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateStyleBibleUpsertBody } from "@/lib/route-validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const bible = await prisma.styleBible.findUnique({
      where: { projectId },
    });
    return NextResponse.json(bible);
  } catch (err) {
    console.error("[GET style-bible]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const parsed = validateStyleBibleUpsertBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
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
    const parsed = validateStyleBibleUpsertBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
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
