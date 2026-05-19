import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initProjectDirs } from "@/lib/asset";
import { validateProjectCreateBody } from "@/lib/route-validation";

const projectCardSelect = {
  id: true,
  title: true,
  type: true,
  aspect: true,
  worldSetting: true,
  era: true,
  createdAt: true,
  characters: {
    select: {
      id: true,
      name: true,
    },
  },
  episodes: {
    orderBy: { episodeNum: "asc" as const },
    select: {
      id: true,
      episodeNum: true,
      title: true,
      productionStage: true,
    },
  },
  styleBible: {
    select: {
      id: true,
      genreTag: true,
      visualStyle: true,
    },
  },
};

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: projectCardSelect,
    });
    return NextResponse.json(projects);
  } catch (err) {
    console.error("[GET /api/projects]", err);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = validateProjectCreateBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;

    const project = await prisma.project.create({
      data: {
        title: body.title,
        type: body.type ?? "short-drama",
        aspect: body.aspect ?? "9:16",
        worldSetting: body.worldSetting?.trim() ?? "",
        era: body.era?.trim() ?? "",
      },
    });

    initProjectDirs(project.id);

    const hydratedProject = await prisma.project.findUnique({
      where: { id: project.id },
      select: projectCardSelect,
    });

    return NextResponse.json(hydratedProject, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects]", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
