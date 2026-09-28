import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { finalizeQuotaRead, getMissingQuotaTypes, mergeQuotaReads } = require(
  "../electron/quota-recovery.cjs",
) as {
  getMissingQuotaTypes(data: unknown): string[];
  mergeQuotaReads(previous: any, next: any): any;
  finalizeQuotaRead(
    current: any,
    stored: any,
    attempts: number,
    attemptedAt: string,
  ): any;
};

const primary = { usedPercent: 20, resetsAt: 100, windowDurationMins: 300 };
const secondary = {
  usedPercent: 40,
  resetsAt: 200,
  windowDurationMins: 10080,
};

function data(primaryValue: unknown, secondaryValue: unknown) {
  return {
    accountId: "account",
    rateLimits: {
      limitId: "codex",
      primary: primaryValue,
      secondary: secondaryValue,
    },
    rateLimitResetCredits: { availableCount: 0, credits: [] },
  };
}

describe("quota recovery", () => {
  it("combines quota windows returned by separate retry attempts", () => {
    const merged = mergeQuotaReads(data(primary, null), data(null, secondary));
    expect(getMissingQuotaTypes(merged)).toEqual([]);
    expect(merged.rateLimits.primary).toEqual(primary);
    expect(merged.rateLimits.secondary).toEqual(secondary);
  });

  it("keeps reset cards returned by an earlier retry", () => {
    const previous: any = data(primary, null);
    previous.rateLimitResetCredits = {
      availableCount: 1,
      credits: [{ id: "credit-1", status: "available" }],
    };
    const next: any = data(null, secondary);
    next.rateLimitResetCredits = null;

    const merged = mergeQuotaReads(previous, next);

    expect(merged.rateLimitResetCredits).toEqual(previous.rateLimitResetCredits);
  });

  it("uses a stored real window only when retries still omit it", () => {
    const finalized = finalizeQuotaRead(
      data(primary, null),
      data(primary, secondary),
      3,
      "2026-09-28T12:00:00.000Z",
    );
    expect(finalized.rateLimits.secondary).toEqual(secondary);
    expect(finalized.quotaReadStatus).toEqual({
      attemptedAt: "2026-09-28T12:00:00.000Z",
      attempts: 3,
      missingQuotaTypes: ["secondary"],
      cachedQuotaTypes: ["secondary"],
    });
  });

  it("keeps an unknown window empty when no history exists", () => {
    const finalized = finalizeQuotaRead(
      data(primary, null),
      null,
      3,
      "2026-09-28T12:00:00.000Z",
    );
    expect(finalized.rateLimits.secondary).toBeNull();
    expect(finalized.quotaReadStatus.cachedQuotaTypes).toEqual([]);
  });
});
