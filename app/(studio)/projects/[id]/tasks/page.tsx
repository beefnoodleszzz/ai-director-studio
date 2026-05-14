"use client";

import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { TaskCenter } from "@/components/studio/TaskCenter";

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="icon" className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">任务中心</h1>
          <p className="text-xs text-muted-foreground mt-0.5">所有生成任务的持久化记录，重启应用后状态不丢失</p>
        </div>
      </div>
      <TaskCenter projectId={projectId} autoRefresh />
    </div>
  );
}
