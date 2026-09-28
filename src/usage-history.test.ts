import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { didWindowReset, getWindowResetCount, updateUsageStats } = require(
  "../electron/usage-history.cjs",
) as {
  didWindowReset(
    previous: { usedPercent: number; resetsAt: number },
    next: { usedPercent: number; resetsAt: number },
    nowSeconds: number,
  ): boolean;
  getWindowResetCount(
    previous: {
      usedPercent: number;
      resetsAt: number;
      windowDurationMins: number;
    },
    next: {
      usedPercent: number;
      resetsAt: number;
      windowDurationMins: number;
    },
    nowSeconds: number,
  ): number;
  updateUsageStats(
    stored: unknown,
    next: unknown,
    source: string,
    outcome?: string | null,
    nowMs?: number,
  ): {
    officialResetCount: number;
    officialPrimaryResetCount: number;
    officialSecondaryResetCount: number;
    resetCreditUseCount: number;
    events: Array<{ type: string; count: number; occurredAt: string }>;
  };
};

function rateLimitData(primaryUsed: number, primaryReset: number) {
  return {
    rateLimits: {
      primary: {
        usedPercent: primaryUsed,
        resetsAt: primaryReset,
        windowDurationMins: 300,
      },
      secondary: {
        usedPercent: 40,
        resetsAt: 99_000,
        windowDurationMins: 10080,
      },
    },
  };
}

describe("persistent usage history", () => {
  it("detects a server-side reset when the window advances and usage drops", () => {
    expect(
      didWindowReset(
        { usedPercent: 82, resetsAt: 10_000 },
        { usedPercent: 4, resetsAt: 28_000 },
        9_000,
      ),
    ).toBe(true);
  });

  it("counts every elapsed quota window after the app was closed", () => {
    expect(
      getWindowResetCount(
        { usedPercent: 82, resetsAt: 10_000, windowDurationMins: 300 },
        { usedPercent: 4, resetsAt: 82_000, windowDurationMins: 300 },
        80_000,
      ),
    ).toBe(4);
  });

  it("does not count an ordinary refresh as a reset", () => {
    expect(
      didWindowReset(
        { usedPercent: 42, resetsAt: 10_000 },
        { usedPercent: 45, resetsAt: 10_000 },
        9_000,
      ),
    ).toBe(false);
  });

  it("does not record a normal reset that follows the scheduled window", () => {
    const stored = {
      usageStats: null,
      rateLimitData: rateLimitData(82, 10_000),
    };
    const refreshed = updateUsageStats(
      stored,
      rateLimitData(4, 28_000),
      "refresh",
      null,
      9_000_000,
    );
    expect(refreshed.officialResetCount).toBe(0);
    expect(refreshed.events).toEqual([]);
  });

  it("records the detection time when both windows recover early", () => {
    const nowSeconds = 2_000_000_000;
    const stored = {
      usageStats: null,
      rateLimitData: {
        rateLimits: {
          primary: {
            usedPercent: 68,
            resetsAt: nowSeconds + 3 * 3600,
            windowDurationMins: 300,
          },
          secondary: {
            usedPercent: 91,
            resetsAt: nowSeconds + 3 * 86400,
            windowDurationMins: 10080,
          },
        },
      },
    };
    const next = {
      rateLimits: {
        primary: {
          usedPercent: 0,
          resetsAt: nowSeconds + 5 * 3600,
          windowDurationMins: 300,
        },
        secondary: {
          usedPercent: 0,
          resetsAt: nowSeconds + 7 * 86400,
          windowDurationMins: 10080,
        },
      },
    };
    const detectedAt = nowSeconds * 1000;
    const refreshed = updateUsageStats(
      stored,
      next,
      "refresh",
      null,
      detectedAt,
    );

    expect(refreshed.officialResetCount).toBe(1);
    expect(refreshed.officialPrimaryResetCount).toBe(0);
    expect(refreshed.officialSecondaryResetCount).toBe(0);
    expect(refreshed.events[0].type).toBe("unexpected-official-reset");
    expect(refreshed.events[0].count).toBe(1);
    expect(refreshed.events[0].occurredAt).toBe(
      new Date(detectedAt).toISOString(),
    );

    const redeemed = updateUsageStats(
      { usageStats: refreshed, rateLimitData: next },
      next,
      "reset-credit",
      "reset",
      detectedAt + 100_000,
    );
    expect(redeemed.officialResetCount).toBe(1);
    expect(redeemed.resetCreditUseCount).toBe(1);
    expect(redeemed.events).toEqual(refreshed.events);
  });

  it("does not treat a reset-card redemption as an official reset", () => {
    const refreshed = updateUsageStats(
      { usageStats: null, rateLimitData: rateLimitData(4, 28_000) },
      rateLimitData(0, 30_000),
      "reset-credit",
      "reset",
      9_100_000,
    );

    expect(refreshed.officialResetCount).toBe(0);
    expect(refreshed.resetCreditUseCount).toBe(1);
    expect(refreshed.events).toEqual([]);
  });
});
