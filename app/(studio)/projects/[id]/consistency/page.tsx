"use client";

import { use } from "react";
import { ConsistencyReport } from "@/components/studio/ConsistencyReport";

export default function ConsistencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ConsistencyReport projectId={projectId} />
    </div>
  );
}
