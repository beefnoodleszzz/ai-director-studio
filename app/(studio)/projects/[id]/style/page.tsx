"use client";

import { use, useEffect, useState } from "react";
import { StyleBibleEditor, type StyleBibleData } from "@/components/studio/StyleBibleEditor";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";

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
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="icon" className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">风格圣经</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : styleBible ? (
        <StyleBibleEditor projectId={projectId} initialData={styleBible} onSave={handleSave} />
      ) : null}
    </div>
  );
}
