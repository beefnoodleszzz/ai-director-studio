"use client";

import { use } from "react";
import { ProviderBenchmark } from "@/components/studio/ProviderBenchmark";

export default function BenchmarkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ProviderBenchmark projectId={projectId} />
    </div>
  );
}
