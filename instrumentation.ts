/**
 * Next.js Instrumentation Hook
 *
 * 所有 Node.js 专属逻辑（Prisma、workflow 调用等）都在 instrumentation.node.ts，
 * 通过条件动态导入加载，避免 Edge runtime 追踪 Node.js-only 模块。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recoverTasks } = await import("./instrumentation.node");
    await recoverTasks();
  }
}
