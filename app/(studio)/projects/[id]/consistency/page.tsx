"use client";

import { use } from "react";
import { ConsistencyReport } from "@/components/studio/ConsistencyReport";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

export default function ConsistencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  return (
    <ProjectPageShell
      title="角色一致性"
      description="追踪跨镜头、跨场次、跨集的角色稳定性，快速定位脸部、服装和身份漂移。"
      backHref={`/projects/${projectId}`}
      contentClassName="app-page-narrow"
    >
      <ConsistencyReport projectId={projectId} />
    </ProjectPageShell>
  );
}
