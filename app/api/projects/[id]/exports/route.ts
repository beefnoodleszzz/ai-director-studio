import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removePublicUrlIfExists, toAbsolutePublicPath } from "@/lib/asset";
import fs from "fs";
import { parseProjectExportsDeleteQueryParams } from "@/lib/route-validation";

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
          const manifestLocal = toAbsolutePublicPath(record.manifestPath);
          if (manifestLocal && fs.existsSync(manifestLocal)) {
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
    const parsed = parseProjectExportsDeleteQueryParams(req.url);
    if (!parsed.ok) {
      return parsed.response;
    }

    const { exportId, deleteFiles } = parsed.value;

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
