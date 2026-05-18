import { NextRequest, NextResponse } from "next/server";
import { generateCharacterCoreAssetPack } from "@/lib/workflows/character-assets";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params;
    const result = await generateCharacterCoreAssetPack(projectId, charId);

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
