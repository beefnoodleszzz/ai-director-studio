import { NextRequest, NextResponse } from "next/server";
import { recommendProvider } from "@/lib/provider-recommender";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(req.url);
    const takeType = searchParams.get("takeType") ?? "image";
    const fallback = searchParams.get("fallback") ?? "seedream";

    const result = await recommendProvider(projectId, takeType, fallback);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
