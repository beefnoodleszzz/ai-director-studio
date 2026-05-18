import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus, getProjectTasks, getQueueStats, cancelTask } from "@/lib/task-queue";
import { prisma } from "@/lib/prisma";
import { removePublicUrlIfExists } from "@/lib/asset";
import { parseBlockMeta } from "@/lib/studio-contracts";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");
    const projectId = searchParams.get("projectId");

    if (taskId) {
      const status = await getTaskStatus(taskId);
      if (!status) return NextResponse.json({ error: "Task not found" }, { status: 404 });
      return NextResponse.json(status);
    }

    if (projectId) {
      const tasks = await getProjectTasks(projectId, 100);
      const queueStats = getQueueStats();
      return NextResponse.json({
        tasks: tasks.map((task) => ({
          ...task,
          blockMeta: parseBlockMeta(task.blockMeta),
        })),
        queueStats,
      });
    }

    const queueStats = getQueueStats();
    return NextResponse.json({ queueStats });
  } catch (err) {
    console.error("[GET /api/task/status]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const hardDelete = searchParams.get("hardDelete") === "true";
    const deleteOutput = searchParams.get("deleteOutput") === "true";

    const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (!hardDelete) {
      await cancelTask(taskId);
      return NextResponse.json({ success: true, mode: "cancelled" });
    }

    if (deleteOutput && task.outputRef) {
      try {
        const output = JSON.parse(task.outputRef) as { publicUrl?: string; url?: string; outputUrl?: string };
        removePublicUrlIfExists(output.publicUrl ?? output.url ?? output.outputUrl);
      } catch {
        // noop
      }
    }

    await prisma.generationTask.delete({ where: { id: taskId } });
    return NextResponse.json({ success: true, mode: "deleted" });
  } catch (err) {
    console.error("[DELETE /api/task/status]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
