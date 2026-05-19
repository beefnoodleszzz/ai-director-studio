/**
 * 重试任务 API
 *
 * 根据失败任务的 inputRef，重新触发对应类型的生成。
 */
import { NextRequest, NextResponse } from "next/server";
import { cloneTaskForRetry } from "@/lib/task-replayer";
import { prisma } from "@/lib/prisma";
import { validateTaskRetryBody } from "@/lib/route-validation";

export async function POST(req: NextRequest) {
  try {
    const parsed = validateTaskRetryBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const { taskId } = parsed.value;

    const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (task.status !== "failed" && task.status !== "cancelled") {
      return NextResponse.json({ error: "Only failed/cancelled tasks can be retried" }, { status: 400 });
    }

    const newTaskId = await cloneTaskForRetry(taskId);
    return NextResponse.json({ ok: true, newTaskId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
