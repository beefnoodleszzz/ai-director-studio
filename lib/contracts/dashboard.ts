export interface DashboardTakeStats {
  total: number;
  passed: number;
  warned: number;
  failed: number;
  unreviewed: number;
  passRate: number;
  warnRate: number;
  wastageRate: number;
}

export interface DashboardShotStats {
  total: number;
  draft: number;
  generating: number;
  imageReady: number;
  videoReady: number;
  blocked: number;
}

export interface DashboardTaskStats {
  total: number;
  completed: number;
  failed: number;
  queued: number;
  running: number;
  avgAttempts: number;
}

export interface DashboardProviderStats {
  provider: string;
  total: number;
  passRate: number;
  warnRate: number;
  failRate: number;
  avgScore: number;
}

export interface DashboardContentStats {
  hookPassRate: number;
  escalationPassRate: number;
  cliffhangerPassRate: number;
  criticalVideoRate: number;
  dialogueCoverageRate: number;
}

export interface DashboardData {
  takeStats: DashboardTakeStats;
  shotStats: DashboardShotStats;
  taskStats: DashboardTaskStats;
  providerStats: DashboardProviderStats[];
  contentStats: DashboardContentStats;
}

export interface ProviderAggregateInput {
  provider: string;
  total: number;
  passed: number;
  warned: number;
  failed: number;
  scoreSum: number;
}

export function buildDashboardProviderStats(
  providerMap: Map<string, ProviderAggregateInput>
): DashboardProviderStats[] {
  return Array.from(providerMap.values())
    .map((data) => ({
      provider: data.provider,
      total: data.total,
      passRate: data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0,
      warnRate: data.total > 0 ? Math.round((data.warned / data.total) * 100) : 0,
      failRate: data.total > 0 ? Math.round((data.failed / data.total) * 100) : 0,
      avgScore: data.total > 0 ? Math.round((data.scoreSum / data.total) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.passRate - a.passRate);
}
