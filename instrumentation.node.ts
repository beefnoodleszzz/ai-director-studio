/**
 * Node.js 专属启动恢复逻辑
 *
 * 此文件仅通过 instrumentation.ts 在 Node.js runtime 下动态导入，
 * 不会被 Edge runtime 追踪，避免 Turbopack Edge 兼容警告。
 *
 * 恢复策略：
 * - running / retrying → 进程中断无法续执行，标记为 failed
 * - queued（未超次数）→ 真实自动恢复执行（重新提交到 pQueue，复用现有 taskId）
 * - queued（超出 maxAttempts）→ 标记为 failed
 *
 * 防重措施：
 * - 恢复前检查目标是否已有 adopted take（目标已达成则跳过）
 * - runTask 立即标记为 running，防止重复调度
 * - 恢复任务限速：每隔 200ms 启动一个，避免一次性淹没 pQueue
 */

import { prisma } from "@/lib/prisma";
import { runTask, appendTaskLog } from "@/lib/task-queue";
import {
  generateShotImages,
} from "@/lib/workflows/image-generation";
import {
  generateShotVideo,
} from "@/lib/workflows/video-generation";
import {
  generateShotAudio,
  generateShotSFX,
} from "@/lib/workflows/audio-generation";
import {
  assembleShortDrama,
} from "@/lib/workflows/assembly";

// ── 主入口，由 instrumentation.ts 调用 ──────────────────────────────────────

export async function recoverTasks() {
  try {
    // ── 1. 清理中断任务 ─────────────────────────────────────────────────────
    const interruptedCount = await prisma.generationTask.count({
      where: { status: { in: ["running", "retrying"] } },
    });

    if (interruptedCount > 0) {
      await prisma.generationTask.updateMany({
        where: { status: { in: ["running", "retrying"] } },
        data: {
          status: "failed",
          errorReason: "应用重启导致任务中断，请在任务中心手动重试",
        },
      });
      console.log(`[task-recovery] ${interruptedCount} 个运行中任务标记为 failed`);
    }

    // ── 2. 扫描 queued 任务 ─────────────────────────────────────────────────
    const queuedTasks = await prisma.generationTask.findMany({
      where: { status: "queued" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    const recoverableTasks = queuedTasks.filter((t) => t.attempts < t.maxAttempts);
    const exhaustedTasks = queuedTasks.filter((t) => t.attempts >= t.maxAttempts);

    if (exhaustedTasks.length > 0) {
      await prisma.generationTask.updateMany({
        where: { id: { in: exhaustedTasks.map((t) => t.id) } },
        data: { status: "failed", errorReason: "已达最大重试次数，请手动重试" },
      });
      console.log(`[task-recovery] ${exhaustedTasks.length} 个 queued 任务超最大次数，标记为 failed`);
    }

    if (recoverableTasks.length > 0) {
      console.log(`[task-recovery] 发现 ${recoverableTasks.length} 个 queued 任务，将自动恢复执行`);
      // 延迟 2s 等 Next.js 完全初始化，不阻塞 register()
      setTimeout(() => {
        void recoverAll(recoverableTasks);
      }, 2000);
    }
  } catch (e) {
    console.error("[task-recovery] 启动恢复失败:", e);
  }
}

// ── 批量恢复 ─────────────────────────────────────────────────────────────────

async function recoverAll(
  tasks: Awaited<ReturnType<typeof prisma.generationTask.findMany>>
) {
  for (const task of tasks) {
    try {
      await recoverOne(task);
    } catch (e) {
      console.error(`[task-recovery] 恢复任务 ${task.id} 出错:`, e);
      // 标记为 failed，带上错误原因
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: "failed", errorReason: e instanceof Error ? e.message : String(e) },
      }).catch(() => {});
    }
    // 限速：每 200ms 提交一个任务
    await new Promise<void>((r) => setTimeout(r, 200));
  }
}

// ── 单任务恢复 ────────────────────────────────────────────────────────────────

async function recoverOne(
  task: Awaited<ReturnType<typeof prisma.generationTask.findMany>>[number]
) {
  const inputRef = task.inputRef
    ? (JSON.parse(task.inputRef) as Record<string, string>)
    : {};
  const projectId = task.projectId;
  const shotId = task.shotId ?? inputRef.shotId ?? null;

  await appendTaskLog(
    task.id,
    `[RECOVERY] 应用重启自动恢复 (type=${task.taskType}, attempt=${task.attempts + 1}/${task.maxAttempts})`
  );

  // 通过 shotId → sceneId → episodeId 补全层级 ID
  const resolveShot = async (sid: string) => {
    const shot = await prisma.shot.findUnique({
      where: { id: sid },
      include: { scene: true },
    });
    if (!shot) throw new Error(`Shot ${sid} 已不存在，无法恢复任务`);
    return { shot, sceneId: shot.sceneId, episodeId: shot.scene.episodeId };
  };

  switch (task.taskType) {
    // ── image ────────────────────────────────────────────────────────────────
    case "image": {
      if (!shotId) throw new Error("image 任务 inputRef 缺少 shotId");
      const { shot, sceneId, episodeId } = await resolveShot(shotId);

      // 已有 adopted 图像 take → 目标达成，跳过
      const adoptedImage = await prisma.take.findFirst({
        where: { shotId, takeType: "image", isAdopted: true },
      });
      if (adoptedImage) {
        await prisma.generationTask.update({
          where: { id: task.id },
          data: {
            status: "completed",
            outputRef: JSON.stringify({ skipped: true, reason: "already-adopted" }),
          },
        });
        await appendTaskLog(task.id, "[RECOVERY] 跳过：已有 adopted 图像 take");
        return;
      }

      runTask(task.id, () =>
        generateShotImages({
          projectId,
          episodeId,
          sceneId,
          shotId,
          prompt: inputRef.prompt ?? shot.visualPrompt,
          provider: inputRef.provider || undefined,
          candidateCount: 1,
        })
      ).catch((e) => console.error(`[task-recovery] image ${task.id} 执行失败:`, e));
      break;
    }

    // ── video ────────────────────────────────────────────────────────────────
    case "video": {
      if (!shotId) throw new Error("video 任务 inputRef 缺少 shotId");
      const { shot, sceneId, episodeId } = await resolveShot(shotId);

      const adoptedVideo = await prisma.take.findFirst({
        where: { shotId, takeType: "video", isAdopted: true },
      });
      if (adoptedVideo) {
        await prisma.generationTask.update({
          where: { id: task.id },
          data: {
            status: "completed",
            outputRef: JSON.stringify({ skipped: true, reason: "already-adopted" }),
          },
        });
        await appendTaskLog(task.id, "[RECOVERY] 跳过：已有 adopted 视频 take");
        return;
      }

      const adoptedImage = await prisma.take.findFirst({
        where: { shotId, takeType: "image", isAdopted: true },
      });
      if (!adoptedImage) {
        throw new Error("视频恢复失败：未找到 adopted 图像 take");
      }

      runTask(task.id, () =>
        generateShotVideo({
          projectId,
          episodeId,
          sceneId,
          shotId,
          adoptedImageTakeId: adoptedImage.id,
          visualPrompt: shot.visualPrompt,
          provider: inputRef.provider || undefined,
        })
      ).catch((e) => console.error(`[task-recovery] video ${task.id} 执行失败:`, e));
      break;
    }

    // ── audio ────────────────────────────────────────────────────────────────
    case "audio": {
      if (!shotId) throw new Error("audio 任务 inputRef 缺少 shotId");
      const { shot, sceneId, episodeId } = await resolveShot(shotId);

      const adoptedAudio = await prisma.take.findFirst({
        where: { shotId, takeType: "audio", isAdopted: true },
      });
      if (adoptedAudio) {
        await prisma.generationTask.update({
          where: { id: task.id },
          data: {
            status: "completed",
            outputRef: JSON.stringify({ skipped: true, reason: "already-adopted" }),
          },
        });
        await appendTaskLog(task.id, "[RECOVERY] 跳过：已有 adopted 音频 take");
        return;
      }

      runTask(task.id, () =>
        generateShotAudio({
          projectId,
          episodeId,
          sceneId,
          shotId,
          dialogue: shot.dialogue,
          audioPrompt: shot.audioPrompt,
          provider: inputRef.provider || undefined,
        })
      ).catch((e) => console.error(`[task-recovery] audio ${task.id} 执行失败:`, e));
      break;
    }

    // ── sfx ──────────────────────────────────────────────────────────────────
    case "sfx": {
      if (!shotId) throw new Error("sfx 任务 inputRef 缺少 shotId");
      const { shot, sceneId, episodeId } = await resolveShot(shotId);
      const sfxPrompt = shot.audioPrompt || shot.dialogue || "ambient sound effect";

      runTask(task.id, () =>
        generateShotSFX(projectId, episodeId, sceneId, shotId, sfxPrompt)
      ).catch((e) => console.error(`[task-recovery] sfx ${task.id} 执行失败:`, e));
      break;
    }

    // ── assembly ─────────────────────────────────────────────────────────────
    case "assembly": {
      const episodeId = inputRef.episodeId;
      if (!episodeId) throw new Error("assembly 任务 inputRef 缺少 episodeId");

      runTask(task.id, () =>
        assembleShortDrama({
          projectId,
          episodeId,
          aspect: (inputRef.aspect as "16:9" | "9:16") ?? "16:9",
          bgmPath: inputRef.bgmPath || undefined,
        })
      ).catch((e) => console.error(`[task-recovery] assembly ${task.id} 执行失败:`, e));
      break;
    }

    // ── script-breakdown ─────────────────────────────────────────────────────
    case "script-breakdown": {
      // 剧本拆解需要完整剧本文本，inputRef 只存了 episodeId，无法重建
      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          status: "failed",
          errorReason: "剧本拆解任务无法自动恢复，请在剧集页面重新提交拆解",
        },
      });
      await appendTaskLog(task.id, "[RECOVERY] script-breakdown 无法重建输入，已标记 failed");
      break;
    }

    default: {
      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          status: "failed",
          errorReason: `未知任务类型 ${task.taskType}，无法自动恢复`,
        },
      });
      await appendTaskLog(task.id, `[RECOVERY] 未知 taskType，已标记 failed`);
    }
  }
}
