import { NextRequest, NextResponse } from "next/server";
import { recommendProvider } from "@/lib/provider-recommender";
import { parseProjectRecommendProviderQueryParams } from "@/lib/route-validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const parsed = parseProjectRecommendProviderQueryParams(req.url);
    if (!parsed.ok) {
      return parsed.response;
    }

    const { takeType, fallback } = parsed.value;

    const result = await recommendProvider(projectId, takeType, fallback);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
