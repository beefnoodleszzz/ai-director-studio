import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initProjectDirs } from "@/lib/asset";
import { deriveProjectProgress } from "@/lib/production-state";

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        characters: { select: { id: true, name: true } },
        episodes: { orderBy: { episodeNum: "asc" }, select: { id: true, episodeNum: true, title: true, productionStage: true } },
        styleBible: { select: { id: true, genreTag: true, visualStyle: true } },
      },
    });
    return NextResponse.json(
      projects.map((project) => ({
        ...project,
        progress: deriveProjectProgress(project.episodes),
      }))
    );
  } catch (err) {
    console.error("[GET /api/projects]", err);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title: string;
      type?: string;
      aspect?: string;
      platform?: string;
      worldSetting?: string;
      era?: string;
    };

    if (!body.title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        title: body.title,
        type: body.type ?? "short-drama",
        aspect: body.aspect ?? "9:16",
        platform: body.platform ?? "",
        worldSetting: body.worldSetting ?? "",
        era: body.era ?? "",
        styleBible: { create: {} },
      },
      include: { styleBible: true, characters: true, episodes: true },
    });

    initProjectDirs(project.id);

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects]", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
