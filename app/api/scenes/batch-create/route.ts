/**
 * @deprecated 使用 /api/generate/script 代替（已集成场次/镜头拆解）
 * 保留此路由仅为兼容旧客户端调用
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Use /api/generate/script instead." },
    { status: 410 }
  );
}
