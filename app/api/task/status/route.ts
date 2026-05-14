import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus, getProjectTasks, getQueueStats, cancelTask } from "@/lib/task-queue";

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
      return NextResponse.json({ tasks, queueStats });
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

    await cancelTask(taskId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/task/status]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
