import { describe, expect, it } from "vitest";
import {
  accountNeedsAttention,
  canResetExhaustedWeeklyQuota,
  formatCountdown,
  formatElapsedSinceReset,
  formatExpiry,
  formatFullResetDateTime,
  formatTimeUntil,
  getAccountHealth,
  getAvailableResetCreditId,
  getExhaustedQuotaLabel,
  getMissingQuotaLabel,
  getAccountPlan,
  getPlanLabel,
  getResetCount,
  getResetCreditDisplay,
  isSuspectedBugAccount,
  remainingPercent,
} from "./utils";
import type { ManagedAccount, ResetCredit } from "./types";

const connectedAccount: ManagedAccount = {
  id: "account-1",
  label: "主账号",
  codexHome: "C:\\profiles\\account-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-28T08:00:00.000Z",
  status: "connected",
  account: { type: "chatgpt", email: "user@example.com", planType: "plus" },
  rateLimitData: {
    accountId: "workspace-1",
    rateLimits: {
      limitId: "codex",
      limitName: "Codex",
      planType: "plus",
      primary: { usedPercent: 20, resetsAt: null, windowDurationMins: 300 },
      secondary: { usedPercent: 30, resetsAt: null, windowDurationMins: 10080 },
      credits: null,
      individualLimit: null,
      rateLimitReachedType: null,
      spendControlReached: false,
    },
    rateLimitResetCredits: { availableCount: 0, credits: [] },
  },
  lastError: null,
};

describe("usage formatting", () => {
  it("converts used quota to remaining quota", () => {
    expect(
      remainingPercent({
        usedPercent: 27,
        resetsAt: null,
        windowDurationMins: 300,
      }),
    ).toBe(73);
  });

  it("formats a stable countdown", () => {
    expect(formatCountdown(10_000, 9_000_000)).toBe("00:16:40");
  });

  it("formats an unexpected reset as elapsed time and a full local timestamp", () => {
    const resetAt = new Date(2026, 8, 26, 19, 0, 0);
    expect(
      formatElapsedSinceReset(
        resetAt.toISOString(),
        resetAt.getTime() + 5 * 3600_000,
      ),
    ).toBe("已有 5 小时");
    expect(formatFullResetDateTime(resetAt.toISOString())).toBe(
      "2026-09-26 19:00",
    );
  });

  it("uses readable plan labels", () => {
    expect(getPlanLabel("self_serve_business_usage_based")).toBe("Business");
    expect(getPlanLabel("PLUS")).toBe("Plus");
    expect(getPlanLabel("unknown")).toBe("未知套餐");
    expect(getPlanLabel("future_ultra")).toBe(
      "未知套餐（future_ultra）",
    );
  });

  it("uses the quota snapshot plan when the account identity is unknown", () => {
    const account = structuredClone(connectedAccount);
    if (account.account?.type === "chatgpt") {
      account.account.planType = "unknown";
    }
    if (account.rateLimitData?.rateLimits) {
      account.rateLimitData.rateLimits.planType = "edu_pro";
    }

    expect(getAccountPlan(account)).toBe("edu_pro");
    expect(getPlanLabel(getAccountPlan(account))).toBe("Edu Pro");
  });

  it("summarizes account health from the lowest quota window", () => {
    expect(getAccountHealth(connectedAccount)).toEqual({
      tone: "healthy",
      label: "账号状态正常",
      description: "最低额度窗口仍有 70%",
    });
    expect(accountNeedsAttention(connectedAccount)).toBe(false);

    const lowQuota = structuredClone(connectedAccount);
    if (lowQuota.rateLimitData?.rateLimits?.primary) {
      lowQuota.rateLimitData.rateLimits.primary.usedPercent = 91;
    }
    expect(getAccountHealth(lowQuota).tone).toBe("danger");
    expect(accountNeedsAttention(lowQuota)).toBe(true);
  });

  it("marks accounts with working primary usage and persistently missing weekly quota", () => {
    const suspected = structuredClone(connectedAccount);
    if (suspected.rateLimitData) {
      suspected.rateLimitData.quotaReadStatus = {
        attemptedAt: "2026-09-28T08:00:00.000Z",
        attempts: 3,
        missingQuotaTypes: ["secondary"],
        cachedQuotaTypes: ["secondary"],
      };
    }
    expect(isSuspectedBugAccount(suspected)).toBe(true);
    expect(getAccountHealth(suspected)).toEqual({
      tone: "warning",
      label: "疑似 BUG号",
      description: "5 小时额度正常扣量，但每周额度持续未读取，仅作状态提示",
    });
    expect(accountNeedsAttention(suspected)).toBe(false);

    if (suspected.rateLimitData?.rateLimits?.primary) {
      suspected.rateLimitData.rateLimits.primary.usedPercent = 100;
    }
    expect(getAccountHealth(suspected).label).toBe("5 小时额度已耗尽");
    expect(accountNeedsAttention(suspected)).toBe(true);
  });

  it("localizes full reset credit details", () => {
    const credit: ResetCredit = {
      id: "credit-1",
      status: "available",
      resetType: "codexRateLimits",
      title: "Full reset (Weekly + 5 hr)",
      description: null,
      grantedAt: 1,
      expiresAt: 2,
    };
    expect(getResetCreditDisplay(credit)).toEqual({
      title: "完整额度重置",
      scope: "每周额度 + 5 小时额度",
    });
  });

  it("formats stable relative expiry text", () => {
    expect(formatTimeUntil(10_000, 9_000_000)).toBe("17 分钟后");
    expect(formatTimeUntil(10_000, 10_000_000)).toBe("已到期");
    expect(formatExpiry(10_000, 9_000_000)).toBe("17 分钟后到期");
    expect(formatExpiry(10_000, 10_000_000)).toBe("已到期");
  });

  it("marks an exhausted weekly quota as resettable when a card is available", () => {
    const exhausted = structuredClone(connectedAccount);
    if (exhausted.rateLimitData?.rateLimits?.secondary) {
      exhausted.rateLimitData.rateLimits.secondary.usedPercent = 100;
    }
    if (exhausted.rateLimitData) {
      exhausted.rateLimitData.rateLimitResetCredits = {
        availableCount: 1,
        credits: [
          {
            id: "credit-weekly",
            status: "available",
            resetType: "codexRateLimits",
            title: "Full reset (Weekly + 5 hr)",
            description: null,
            grantedAt: 1,
            expiresAt: 20_000,
          },
        ],
      };
    }

    expect(canResetExhaustedWeeklyQuota(exhausted, 10_000_000)).toBe(true);
    expect(getResetCount(exhausted, 10_000_000)).toBe(1);
    expect(getAvailableResetCreditId(exhausted, 10_000_000)).toBe(
      "credit-weekly",
    );
  });

  it("counts only real, available, unexpired reset credit records", () => {
    const phantom = structuredClone(connectedAccount);
    if (phantom.rateLimitData) {
      phantom.rateLimitData.rateLimitResetCredits = {
        availableCount: 3,
        credits: null,
      };
    }
    expect(getResetCount(phantom, 10_000_000)).toBe(0);

    const unavailable = structuredClone(connectedAccount);
    if (unavailable.rateLimitData) {
      unavailable.rateLimitData.rateLimitResetCredits = {
        availableCount: 2,
        credits: [
          {
            id: "expired-credit",
            status: "available",
            resetType: "codexRateLimits",
            title: null,
            description: null,
            grantedAt: 1,
            expiresAt: 9_000,
          },
          {
            id: "redeemed-credit",
            status: "redeemed",
            resetType: "codexRateLimits",
            title: null,
            description: null,
            grantedAt: 1,
            expiresAt: 20_000,
          },
        ],
      };
    }
    expect(getResetCount(unavailable, 10_000_000)).toBe(0);
  });

  it("labels the exact exhausted quota window", () => {
    const primary = structuredClone(connectedAccount);
    if (primary.rateLimitData?.rateLimits?.primary) {
      primary.rateLimitData.rateLimits.primary.usedPercent = 100;
    }
    expect(getExhaustedQuotaLabel(primary)).toBe("5 小时限额");

    const weekly = structuredClone(connectedAccount);
    if (weekly.rateLimitData?.rateLimits?.secondary) {
      weekly.rateLimitData.rateLimits.secondary.usedPercent = 100;
    }
    expect(getExhaustedQuotaLabel(weekly)).toBe("周限额");

    if (weekly.rateLimitData?.rateLimits?.primary) {
      weekly.rateLimitData.rateLimits.primary.usedPercent = 100;
    }
    expect(getExhaustedQuotaLabel(weekly)).toBe("两项限额");
  });

  it("surfaces the exact quota window that was not returned", () => {
    const incomplete = structuredClone(connectedAccount);
    if (incomplete.rateLimitData?.rateLimits) {
      incomplete.rateLimitData.rateLimits.secondary = null;
    }
    expect(getMissingQuotaLabel(incomplete)).toBe("每周额度未读取");
    expect(getAccountHealth(incomplete)).toEqual({
      tone: "warning",
      label: "额度需重新登录",
      description: "每周额度未读取，请重新登录获取",
    });
    expect(accountNeedsAttention(incomplete)).toBe(true);
  });

  it("marks a repeatedly missing live weekly window as a suspected bug account", () => {
    const recovered = structuredClone(connectedAccount);
    if (recovered.rateLimitData) {
      recovered.rateLimitData.quotaReadStatus = {
        attemptedAt: "2026-09-28T12:00:00.000Z",
        attempts: 3,
        missingQuotaTypes: ["secondary"],
        cachedQuotaTypes: ["secondary"],
      };
    }
    expect(getMissingQuotaLabel(recovered)).toBe(
      "每周额度缺失（显示上次数据）",
    );
    expect(getAccountHealth(recovered)).toEqual({
      tone: "warning",
      label: "疑似 BUG号",
      description: "5 小时额度正常扣量，但每周额度持续未读取，仅作状态提示",
    });
    expect(accountNeedsAttention(recovered)).toBe(false);
  });
});
