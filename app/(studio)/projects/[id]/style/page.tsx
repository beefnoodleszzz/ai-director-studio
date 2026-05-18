"use client";

import { use, useEffect, useState } from "react";
import { StyleBibleEditor, type StyleBibleData } from "@/components/studio/StyleBibleEditor";
import { Loader2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

export default function StyleBiblePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [styleBible, setStyleBible] = useState<StyleBibleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`/api/projects/${projectId}`)
      .then((res) => {
        if (res.data.styleBible) {
          setStyleBible({ ...res.data.styleBible, projectId });
        } else {
          setStyleBible({ projectId, genreTag: "", visualStyle: "", colorStrategy: "", shotPreference: "", imageDensity: "", eraAesthetic: "", setConstraints: "", propConstraints: "", negativeKeywords: "", mangaLayoutStyle: "" });
        }
      })
      .catch(() => toast.error("加载失败"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleSave = async (data: StyleBibleData) => {
    if (data.id) {
      await axios.patch(`/api/projects/${projectId}/style-bible`, data);
    } else {
      const res = await axios.post(`/api/projects/${projectId}/style-bible`, data);
      setStyleBible(res.data);
    }
  };

  return (
    <ProjectPageShell
      title="风格圣经"
      description="统一项目的视觉基调、镜头偏好、负面词和版式倾向，保证整条产线输出风格稳定。"
      backHref={`/projects/${projectId}`}
      contentClassName="app-page-reading"
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : styleBible ? (
        <StyleBibleEditor projectId={projectId} initialData={styleBible} onSave={handleSave} />
      ) : null}
    </ProjectPageShell>
  );
}
