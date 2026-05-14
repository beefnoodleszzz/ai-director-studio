import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { charId } = await params;
    const assets = await prisma.characterAsset.findMany({
      where: { characterId: charId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(assets);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const assetType = (formData.get("assetType") as string) || "reference";
    const label = (formData.get("label") as string) || "";
    const tags: string[] = [];
    const tagsRaw = formData.get("tags") as string | null;
    if (tagsRaw) {
      try { tags.push(...JSON.parse(tagsRaw)); } catch { /* noop */ }
    }

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const assetId = generateId();
    const filename = `${assetId}.${ext}`;

    // 存储到 public/assets/projects/{projectId}/characters/{charId}/
    const dir = path.join(process.cwd(), "public", "assets", "projects", projectId, "characters", charId);
    fs.mkdirSync(dir, { recursive: true });

    const filepath = path.join(dir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    const localUrl = `/assets/projects/${projectId}/characters/${charId}/${filename}`;

    const asset = await prisma.characterAsset.create({
      data: {
        id: assetId,
        characterId: charId,
        assetType,
        localPath: localUrl,
        label,
        tags: JSON.stringify(tags),
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
