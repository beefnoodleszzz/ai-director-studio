import { NextRequest, NextResponse } from "next/server";
import { generateProjectOutline } from "@/lib/workflows/story-workflow";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const outline = await generateProjectOutline(projectId);
    return NextResponse.json(outline);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
