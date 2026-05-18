"use client";

import { use } from "react";
import { QAPanel } from "@/components/studio/QAPanel";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

export default function QAPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  return (
    <ProjectPageShell
      title="QA 审片"
      description="统一审查所有候选结果，指定采用、接受轻微瑕疵或批量重做失败镜头。"
      backHref={`/projects/${projectId}`}
      stickyHeader
    >
      <QAPanel projectId={projectId} />
    </ProjectPageShell>
  );
}
