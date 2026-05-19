import { NextRequest, NextResponse } from "next/server";
import { breakdownScriptWithTask, commitPendingBreakdown } from "@/lib/workflows/script-breakdown";
import { validateScriptBreakdownBody } from "@/lib/route-validation";

export async function POST(req: NextRequest) {
  try {
    const parsed = validateScriptBreakdownBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return parsed.response;
    }
    const { episodeId, projectId, script, pendingData, source = "manual-script" } = parsed.value;

    // 恢复模式：角色圣经已就绪，提交挂起数据
    if (pendingData) {
      const result = await commitPendingBreakdown(episodeId, pendingData);
      return NextResponse.json({ status: "SUCCESS", ...result });
    }

    if (source === "generated-script") {
      const episode = await import("@/lib/prisma").then(({ prisma }) =>
        prisma.episode.findUnique({ where: { id: episodeId } })
      );
      if (!episode?.scriptDraft) {
        return NextResponse.json({ error: "No generated script draft found" }, { status: 422 });
      }
    }

    const result = await breakdownScriptWithTask({ projectId, episodeId, script: script ?? "" });
    return NextResponse.json({
      source,
      ...result,
    });
  } catch (err) {
    console.error("[api/generate/script]", err);
    return NextResponse.json({ error: "Script breakdown failed" }, { status: 500 });
  }
}
