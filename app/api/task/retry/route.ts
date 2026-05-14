/**
 * 重试任务 API
 *
 * 根据失败任务的 inputRef，重新触发对应类型的生成。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShotImagesWithTask } from "@/lib/workflows/image-generation";
import { generateShotVideoWithTask } from "@/lib/workflows/video-generation";
import { generateShotAudioWithTask } from "@/lib/workflows/audio-generation";

export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json() as { taskId: string };
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (task.status !== "failed" && task.status !== "cancelled") {
      return NextResponse.json({ error: "Only failed/cancelled tasks can be retried" }, { status: 400 });
    }

    const input = task.inputRef ? JSON.parse(task.inputRef) : {};
    const { projectId, episodeId, sceneId, shotId, provider } = input;

    let newTaskId: string;

    switch (task.taskType) {
      case "image": {
        const res = await generateShotImagesWithTask({
          projectId,
          episodeId,
          sceneId,
          shotId,
          prompt: input.prompt ?? "",
          provider: provider ?? "seedream",
          candidateCount: 1,
        });
        newTaskId = res.taskId;
        break;
      }
      case "video": {
        const adoptedTake = await prisma.take.findFirst({
          where: { shotId, takeType: "image", isAdopted: true },
        });
        if (!adoptedTake) return NextResponse.json({ error: "No adopted image take found" }, { status: 422 });
        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        const res = await generateShotVideoWithTask({
          projectId,
          episodeId,
          sceneId,
          shotId,
          adoptedTakeId: adoptedTake.id,
          visualPrompt: shot?.visualPrompt ?? input.prompt ?? "",
          provider: provider ?? "kling",
        });
        newTaskId = res.taskId;
        break;
      }
      case "audio": {
        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        const res = await generateShotAudioWithTask({
          projectId,
          episodeId,
          sceneId,
          shotId,
          dialogue: shot?.dialogue ?? "",
          audioPrompt: shot?.audioPrompt ?? "",
          provider: provider ?? "minimax",
        });
        newTaskId = res.taskId;
        break;
      }
      default:
        return NextResponse.json({ error: `Retry not supported for taskType: ${task.taskType}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, newTaskId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
