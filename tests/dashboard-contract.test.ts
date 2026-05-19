import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardProviderStats } from "@/lib/contracts/dashboard";

test("buildDashboardProviderStats computes provider rate breakdowns", () => {
  const providerMap = new Map([
    [
      "alpha",
      {
        provider: "alpha",
        total: 4,
        passed: 2,
        warned: 1,
        failed: 1,
        scoreSum: 2.6,
      },
    ],
    [
      "beta",
      {
        provider: "beta",
        total: 2,
        passed: 1,
        warned: 1,
        failed: 0,
        scoreSum: 1.5,
      },
    ],
  ]);

  const stats = buildDashboardProviderStats(providerMap);

  assert.equal(stats.length, 2);
  assert.deepEqual(stats[0], {
    provider: "alpha",
    total: 4,
    passRate: 50,
    warnRate: 25,
    failRate: 25,
    avgScore: 0.65,
  });
  assert.deepEqual(stats[1], {
    provider: "beta",
    total: 2,
    passRate: 50,
    warnRate: 50,
    failRate: 0,
    avgScore: 0.75,
  });
});
