"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ShotWorkbench } from "@/components/studio/ShotWorkbench";
import axios from "axios";
import { toast } from "sonner";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

interface SceneDetail {
  id: string;
  sceneOrder: number;
  location: string;
  timeOfDay: string;
  summary: string;
  shots: unknown[];
}

export default function SceneWorkbenchPage({
  params,
}: {
  params: Promise<{ id: string; epId: string; scId: string }>;
}) {
  const { id: projectId, epId, scId } = use(params);
  const searchParams = useSearchParams();
  const highlightShotId = searchParams.get("shotId");
  const highlightReason = searchParams.get("reason");
  const highlightRecommendation = searchParams.get("recommendation");
  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`/api/projects/${projectId}/episodes/${epId}/scenes/${scId}`)
      .then((res) => setScene(res.data))
      .catch(() => toast.error("加载场次失败"))
      .finally(() => setLoading(false));
  }, [projectId, epId, scId]);

  if (loading) return <div className="app-page py-16 flex justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  if (!scene) return <div className="app-page py-8 text-center text-muted-foreground">场次不存在</div>;

  return (
    <ProjectPageShell
      title={`镜头工作台 · SC${scene.sceneOrder.toString().padStart(2, "0")}`}
      description={[scene.location, scene.timeOfDay, scene.summary].filter(Boolean).join(" · ") || "在这里完成镜头生成、对比、采用与细节修正。"}
      backHref={`/projects/${projectId}/episodes/${epId}`}
      stickyHeader
    >
      <ShotWorkbench
        projectId={projectId}
        episodeId={epId}
        highlightShotId={highlightShotId ?? undefined}
        highlightReason={highlightReason ?? undefined}
        highlightRecommendation={highlightRecommendation ?? undefined}
        scene={scene as Parameters<typeof ShotWorkbench>[0]["scene"]}
      />
    </ProjectPageShell>
  );
}
