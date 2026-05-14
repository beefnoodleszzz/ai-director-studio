"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ShotWorkbench } from "@/components/studio/ShotWorkbench";
import axios from "axios";
import { toast } from "sonner";

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
  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`/api/projects/${projectId}/episodes/${epId}/scenes/${scId}`)
      .then((res) => setScene(res.data))
      .catch(() => toast.error("加载场次失败"))
      .finally(() => setLoading(false));
  }, [projectId, epId, scId]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  if (!scene) return <div className="p-6 text-center text-muted-foreground">场次不存在</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}/episodes/${epId}`}>
          <Button variant="ghost" size="icon" className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">镜头工作台</h1>
      </div>

      <ShotWorkbench
        projectId={projectId}
        episodeId={epId}
        scene={scene as Parameters<typeof ShotWorkbench>[0]["scene"]}
      />
    </div>
  );
}
