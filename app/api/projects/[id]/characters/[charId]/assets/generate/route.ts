import { NextRequest, NextResponse } from "next/server";
import { generateCharacterCoreAssetPackWithOptions } from "@/lib/workflows/character-assets";
import { validateCharacterAssetGenerationBody } from "@/lib/route-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params;
    let assetTypes: string[] | undefined;
    let limit: number | undefined;

    if (req.headers.get("content-type")?.includes("application/json")) {
      const parsed = validateCharacterAssetGenerationBody(await req.json().catch(() => null));
      if (!parsed.ok) {
        return parsed.response;
      }
      assetTypes = parsed.value.assetTypes;
      limit = parsed.value.limit;
    }

    const result = await generateCharacterCoreAssetPackWithOptions(projectId, charId, {
      assetTypes,
      limit,
    });

    return NextResponse.json({
      ok: true,
      assetStatus: result.assetStatus,
      createdAssets: result.createdAssets,
      reusedAssets: result.reusedAssets,
      assetSnapshot: result.snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("required before generating") || message.includes("not found") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
