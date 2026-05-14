"use client";

import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { QAPanel } from "@/components/studio/QAPanel";

export default function QAPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="icon" className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">QA 审片</h1>
          <p className="text-xs text-muted-foreground mt-0.5">审查所有候选结果，指定采用，一键重做失败镜头</p>
        </div>
      </div>
      <QAPanel projectId={projectId} />
    </div>
  );
}
