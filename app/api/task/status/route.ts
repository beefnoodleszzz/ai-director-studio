import type { NextRequest } from "next/server";

const taskRegistry = new Map<string, { progress: number; status: string; result?: string }>();

export function registerTask(taskId: string) {
  taskRegistry.set(taskId, { progress: 0, status: "pending" });
}

export function updateTaskProgress(taskId: string, progress: number, status: string, result?: string) {
  taskRegistry.set(taskId, { progress, status, result });
}

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId");

  if (!taskId) {
    return new Response("taskId is required", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let attempts = 0;
      const maxAttempts = 120;

      const send = (data: object) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      const timer = setInterval(() => {
        attempts++;
        const task = taskRegistry.get(taskId);

        if (!task) {
          send({ taskId, status: "pending", progress: 0, message: "Waiting..." });
          if (attempts > 10) {
            clearInterval(timer);
            send({ taskId, status: "failed", progress: 0, message: "Task not found" });
            controller.close();
          }
          return;
        }

        send({ taskId, ...task });

        if (task.status === "completed" || task.status === "failed" || attempts >= maxAttempts) {
          clearInterval(timer);
          controller.close();
        }
      }, 2000);

      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
