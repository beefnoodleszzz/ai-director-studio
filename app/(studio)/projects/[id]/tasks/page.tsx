"use client";

import { use } from "react";
import { TaskCenter } from "@/components/studio/TaskCenter";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  return (
    <ProjectPageShell
      title="任务中心"
      description="集中查看所有生成任务的状态、重试记录和输出结果。任务记录持久化，重启后不会丢。"
      backHref={`/projects/${projectId}`}
      contentClassName="app-page-narrow"
      stickyHeader
    >
      <TaskCenter projectId={projectId} autoRefresh />
    </ProjectPageShell>
  );
}
