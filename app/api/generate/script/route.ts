import { NextRequest, NextResponse } from "next/server";
import { breakdownScriptWithTask, commitPendingBreakdown } from "@/lib/workflows/script-breakdown";
import type { ScriptBreakdownResult } from "@/lib/workflows/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      episodeId: string;
      projectId: string;
      script: string;
      source?: "generated-script" | "manual-script";
      // 当 status === NEED_CHARACTER_SETUP 后，前端补完角色再调用，携带 pendingData
      pendingData?: ScriptBreakdownResult;
    };

    const { episodeId, projectId, script, pendingData, source = "manual-script" } = body;

    if (!episodeId || !projectId) {
      return NextResponse.json({ error: "episodeId and projectId are required" }, { status: 400 });
    }

    // 恢复模式：角色圣经已就绪，提交挂起数据
    if (pendingData) {
      const result = await commitPendingBreakdown(episodeId, pendingData);
      return NextResponse.json({ status: "SUCCESS", ...result });
    }

    if (!script) {
      return NextResponse.json({ error: "script is required" }, { status: 400 });
    }

    if (source === "generated-script") {
      const episode = await import("@/lib/prisma").then(({ prisma }) =>
        prisma.episode.findUnique({ where: { id: episodeId } })
      );
      if (!episode?.scriptDraft) {
        return NextResponse.json({ error: "No generated script draft found" }, { status: 422 });
      }
    }

    const result = await breakdownScriptWithTask({ projectId, episodeId, script });
    return NextResponse.json({
      source,
      ...result,
    });
  } catch (err) {
    console.error("[api/generate/script]", err);
    return NextResponse.json({ error: "Script breakdown failed" }, { status: 500 });
  }
}
