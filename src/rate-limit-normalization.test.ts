import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { normalizeRateLimits, normalizeResetCredit } = require(
  "../electron/rate-limit-normalization.cjs",
) as {
  normalizeResetCredit(value: unknown): any;
  normalizeRateLimits(value: any, nowSeconds?: number): any;
};

describe("rate limit normalization", () => {
  it("rejects reset cards without a real identifier", () => {
    expect(normalizeResetCredit({ id: undefined, status: "available" })).toBeNull();
    expect(normalizeResetCredit({ id: null, status: "available" })).toBeNull();
    expect(normalizeResetCredit({ id: "   ", status: "available" })).toBeNull();
  });

  it("accepts numeric timestamps and numeric timestamp strings", () => {
    expect(
      normalizeResetCredit({
        id: "credit-1",
        status: "available",
        resetType: "weekly",
        grantedAt: "100",
        expiresAt: "200",
      }),
    ).toMatchObject({ id: "credit-1", grantedAt: 100, expiresAt: 200 });
  });

  it("counts only validated, available, unexpired reset cards", () => {
    const normalized = normalizeRateLimits(
      {
        accountId: "account-1",
        rateLimits: null,
        rateLimitResetCredits: {
          credits: [
            { id: undefined, status: "available", expiresAt: 500 },
            { id: "expired", status: "available", expiresAt: 90 },
            { id: "redeemed", status: "redeemed", expiresAt: 500 },
            { id: "real", status: "available", expiresAt: 500 },
          ],
        },
      },
      100,
    );

    expect(normalized.rateLimitResetCredits.availableCount).toBe(1);
    expect(normalized.rateLimitResetCredits.credits.map((credit: any) => credit.id))
      .toEqual(["expired", "redeemed", "real"]);
  });
});
