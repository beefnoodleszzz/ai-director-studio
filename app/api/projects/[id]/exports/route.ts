import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removePublicUrlIfExists } from "@/lib/asset";
import fs from "fs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const records = await prisma.exportRecord.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    const withPreflight = records.map((record) => {
      let preflight: Record<string, unknown> | null = null;
      if (record.manifestPath) {
        try {
          const manifestLocal = `${process.cwd()}/public${record.manifestPath.startsWith("/") ? record.manifestPath : `/${record.manifestPath}`}`;
          if (fs.existsSync(manifestLocal)) {
            const parsed = JSON.parse(fs.readFileSync(manifestLocal, "utf8")) as { preflight?: Record<string, unknown> };
            preflight = parsed.preflight ?? null;
          }
        } catch {
          preflight = null;
        }
      }
      return { ...record, preflight };
    });
    return NextResponse.json(withPreflight);
  } catch (err) {
    console.error("[GET /api/projects/:id/exports]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(req.url);
    const exportId = searchParams.get("exportId");
    const deleteFiles = searchParams.get("deleteFiles") === "true";

    if (!exportId) {
      return NextResponse.json({ error: "exportId required" }, { status: 400 });
    }

    const record = await prisma.exportRecord.findFirst({
      where: { id: exportId, projectId },
    });
    if (!record) {
      return NextResponse.json({ error: "Export record not found" }, { status: 404 });
    }

    if (deleteFiles) {
      removePublicUrlIfExists(record.outputPath);
      removePublicUrlIfExists(record.manifestPath);
    }

    await prisma.exportRecord.delete({ where: { id: exportId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/projects/:id/exports]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
