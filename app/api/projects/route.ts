import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        characters: true,
        episodes: { orderBy: { episodeNum: "asc" } },
      },
    });
    return NextResponse.json(projects);
  } catch (err) {
    console.error("[GET /api/projects]", err);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, globalLore } = await req.json() as { title: string; globalLore: string };

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: { title, globalLore: globalLore ?? "" },
      include: { characters: true, episodes: true },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects]", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
