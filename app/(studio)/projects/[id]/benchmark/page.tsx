"use client";

import { use } from "react";
import { ProviderBenchmark } from "@/components/studio/ProviderBenchmark";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";

export default function BenchmarkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  return (
    <ProjectPageShell
      title="Provider 基准"
      description="对比不同 Provider 在真实项目里的通过率、均分、耗时与重试成本。"
      backHref={`/projects/${projectId}`}
      contentClassName="app-page-narrow"
    >
      <ProviderBenchmark projectId={projectId} />
    </ProjectPageShell>
  );
}
