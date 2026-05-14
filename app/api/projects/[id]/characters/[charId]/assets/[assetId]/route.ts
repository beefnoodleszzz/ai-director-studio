import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string; assetId: string }> }
) {
  try {
    const { assetId } = await params;

    const asset = await prisma.characterAsset.findUnique({ where: { id: assetId } });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 删除本地文件
    if (asset.localPath) {
      const absPath = path.join(process.cwd(), "public", asset.localPath.startsWith("/") ? asset.localPath.slice(1) : asset.localPath);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    }

    await prisma.characterAsset.delete({ where: { id: assetId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string; assetId: string }> }
) {
  try {
    const { assetId } = await params;
    const body = await req.json();
    const updated = await prisma.characterAsset.update({
      where: { id: assetId },
      data: {
        label: body.label,
        assetType: body.assetType,
        tags: body.tags ? JSON.stringify(body.tags) : undefined,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
