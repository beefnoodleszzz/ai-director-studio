import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus, getProjectTasks, getQueueStats, cancelTask, parseTaskEvents } from "@/lib/task-queue";
import { prisma } from "@/lib/prisma";
import { removePublicUrlIfExists } from "@/lib/asset";
import { parseBlockMeta } from "@/lib/studio-contracts";
import {
  parseTaskStatusDeleteQueryParams,
  parseTaskStatusQueryParams,
} from "@/lib/route-validation";

export async function GET(req: NextRequest) {
  try {
    const parsed = parseTaskStatusQueryParams(req.url);
    if (!parsed.ok) {
      return parsed.response;
    }

    const { taskId, projectId } = parsed.value;

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
          events: parseTaskEvents(task.logs),
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
    const parsed = parseTaskStatusDeleteQueryParams(req.url);
    if (!parsed.ok) {
      return parsed.response;
    }

    const { taskId, hardDelete, deleteOutput } = parsed.value;

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
