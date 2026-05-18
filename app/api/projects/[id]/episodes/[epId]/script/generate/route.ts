import { NextRequest, NextResponse } from "next/server";
import { generateEpisodeScript } from "@/lib/workflows/story-workflow";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string }> }
) {
  try {
    const { id: projectId, epId } = await params;
    const result = await generateEpisodeScript(projectId, epId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
