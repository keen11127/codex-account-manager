import type {
  ManagedAccount,
  PlanType,
  RateLimitWindow,
  ResetCredit,
  ResetOutcome,
} from "./types";

export type AccountHealthTone = "healthy" | "warning" | "danger" | "neutral";

export interface AccountHealth {
  tone: AccountHealthTone;
  label: string;
  description: string;
}

const planLabels: Record<PlanType, string> = {
  free: "Free",
  go: "Go",
  plus: "Plus",
  pro: "Pro",
  prolite: "Pro 5x",
  team: "Team",
  self_serve_business_prolite: "Business",
  self_serve_business_usage_based: "Business",
  business: "Business",
  ent26: "Enterprise",
  enterprise_cbp_automation: "Enterprise",
  enterprise_cbp_usage_based: "Enterprise",
  enterprise: "Enterprise",
  edu: "Edu",
  edu_plus: "Edu Plus",
  edu_pro: "Edu Pro",
  unknown: "未知套餐",
};

export function getPlanLabel(plan: string | null | undefined) {
  const rawPlan = typeof plan === "string" ? plan.trim() : "";
  if (!rawPlan || rawPlan.toLowerCase() === "unknown") {
    return planLabels.unknown;
  }

  const knownLabel = planLabels[rawPlan.toLowerCase() as PlanType];
  return knownLabel || `未知套餐（${rawPlan}）`;
}

export function remainingPercent(window: RateLimitWindow | null | undefined) {
  if (!window) return null;
  return Math.max(0, Math.min(100, 100 - window.usedPercent));
}

export function formatCountdown(
  unixSeconds: number | null | undefined,
  nowMs: number,
) {
  if (!unixSeconds) return "--:--:--";
  const remaining = Math.max(0, unixSeconds * 1000 - nowMs);
  if (remaining === 0) return "可重置";

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  return days > 0 ? `${days}天 ${clock}` : clock;
}

export function formatDateTime(unixSeconds: number | null | undefined) {
  if (!unixSeconds) return "无固定到期时间";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

export function formatUpdatedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "尚未刷新";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatElapsedSinceReset(iso: string, nowMs: number) {
  const occurredAt = new Date(iso).getTime();
  if (!Number.isFinite(occurredAt)) return "时间未知";

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - occurredAt) / 60_000));
  if (elapsedMinutes < 1) return "刚刚";
  if (elapsedMinutes < 60) return `已有 ${elapsedMinutes} 分钟`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `已有 ${elapsedHours} 小时`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  const remainingHours = elapsedHours % 24;
  return remainingHours > 0
    ? `已有 ${elapsedDays} 天 ${remainingHours} 小时`
    : `已有 ${elapsedDays} 天`;
}

export function formatFullResetDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(" ");
}

export function formatTimeUntil(
  unixSeconds: number | null | undefined,
  nowMs: number,
) {
  if (!unixSeconds) return "无固定到期时间";

  const remainingMs = unixSeconds * 1000 - nowMs;
  if (remainingMs <= 0) return "已到期";

  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (minutes < 60) return `${minutes} 分钟后`;

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} 小时后`;

  return `${Math.ceil(hours / 24)} 天后`;
}

export function formatExpiry(
  unixSeconds: number | null | undefined,
  nowMs: number,
) {
  const relative = formatTimeUntil(unixSeconds, nowMs);
  if (!unixSeconds || relative === "已到期") return relative;
  return `${relative}到期`;
}

export function getAccountEmail(account: ManagedAccount) {
  return account.account?.type === "chatgpt"
    ? account.account.email || "ChatGPT 账号"
    : account.account?.type === "apiKey"
      ? "API Key"
      : "尚未登录";
}

export function getAccountPlan(account: ManagedAccount) {
  if (account.account?.type !== "chatgpt") return null;
  const identityPlan = account.account.planType;
  if (identityPlan && identityPlan !== "unknown") return identityPlan;
  return account.rateLimitData?.rateLimits?.planType || identityPlan;
}

export function getAvailableResetCredits(
  account: ManagedAccount,
  nowMs: number,
) {
  const credits = account.rateLimitData?.rateLimitResetCredits?.credits;
  if (!Array.isArray(credits)) return [];

  return credits.filter(
    (credit) =>
      Boolean(credit.id) &&
      credit.status === "available" &&
      (!credit.expiresAt || credit.expiresAt * 1000 > nowMs),
  );
}

export function getResetCount(account: ManagedAccount, nowMs: number) {
  if (!account.rateLimitData?.rateLimitResetCredits) return null;
  return getAvailableResetCredits(account, nowMs).length;
}

export function hasLimitedQuota(account: ManagedAccount) {
  const limits = account.rateLimitData?.rateLimits;
  if (!limits) return false;
  if (limits.rateLimitReachedType || limits.spendControlReached) return true;

  return [remainingPercent(limits.primary), remainingPercent(limits.secondary)]
    .filter((value): value is number => value !== null)
    .some((value) => value <= 15);
}

export function hasExhaustedPrimaryQuota(account: ManagedAccount) {
  const limits = account.rateLimitData?.rateLimits;
  if (!limits) return false;

  const reachedType = limits.rateLimitReachedType?.toLocaleLowerCase("en-US") || "";
  return (
    remainingPercent(limits.primary) === 0 ||
    reachedType.includes("primary") ||
    reachedType.includes("5_hour") ||
    reachedType.includes("5-hour")
  );
}

export function hasExhaustedWeeklyQuota(account: ManagedAccount) {
  const limits = account.rateLimitData?.rateLimits;
  if (!limits) return false;

  const reachedType = limits.rateLimitReachedType?.toLocaleLowerCase("en-US") || "";
  return (
    remainingPercent(limits.secondary) === 0 ||
    reachedType.includes("weekly") ||
    reachedType.includes("secondary")
  );
}

export function getExhaustedQuotaLabel(account: ManagedAccount) {
  const primary = hasExhaustedPrimaryQuota(account);
  const weekly = hasExhaustedWeeklyQuota(account);
  if (primary && weekly) return "两项限额";
  if (primary) return "5 小时限额";
  if (weekly) return "周限额";
  return null;
}

export function getMissingQuotaLabel(account: ManagedAccount) {
  if (account.status !== "connected") return null;
  const readStatus = account.rateLimitData?.quotaReadStatus;
  if (readStatus?.missingQuotaTypes.length) {
    const missingPrimary = readStatus.missingQuotaTypes.includes("primary");
    const missingSecondary = readStatus.missingQuotaTypes.includes("secondary");
    const scope =
      missingPrimary && missingSecondary
        ? "5 小时与每周额度"
        : missingPrimary
          ? "5 小时额度"
          : "每周额度";
    const allCached = readStatus.missingQuotaTypes.every((type) =>
      readStatus.cachedQuotaTypes.includes(type),
    );
    return allCached ? `${scope}缺失（显示上次数据）` : `${scope}未读取`;
  }
  const limits = account.rateLimitData?.rateLimits;
  if (!limits) return "5 小时与每周额度未读取";
  if (!limits.primary && !limits.secondary) return "5 小时与每周额度未读取";
  if (!limits.primary) return "5 小时额度未读取";
  if (!limits.secondary) return "每周额度未读取";
  return null;
}

export function isSuspectedBugAccount(account: ManagedAccount) {
  if (account.status !== "connected") return false;
  const readStatus = account.rateLimitData?.quotaReadStatus;
  const primary = account.rateLimitData?.rateLimits?.primary;
  return Boolean(
    readStatus &&
      readStatus.attempts >= 2 &&
      readStatus.missingQuotaTypes.includes("secondary") &&
      primary &&
      Number.isFinite(primary.usedPercent) &&
      primary.usedPercent > 0,
  );
}

export function canResetExhaustedWeeklyQuota(
  account: ManagedAccount,
  nowMs: number,
) {
  return (
    hasExhaustedWeeklyQuota(account) &&
    getAvailableResetCredits(account, nowMs).length > 0
  );
}

export function getAvailableResetCreditId(account: ManagedAccount, nowMs: number) {
  return getAvailableResetCredits(account, nowMs)[0]?.id || null;
}

export function getAccountHealth(account: ManagedAccount): AccountHealth {
  if (account.status === "error") {
    return {
      tone: "danger",
      label: "账号刷新异常",
      description: account.lastError || "登录状态或额度数据读取失败",
    };
  }

  if (account.status !== "connected") {
    return {
      tone: "warning",
      label: "等待账号登录",
      description: "登录后即可读取套餐、额度和重置卡",
    };
  }

  const limits = account.rateLimitData?.rateLimits;
  if (!limits) {
    return {
      tone: "warning",
      label: "额度数据未读取",
      description: "5 小时与每周额度均未返回",
    };
  }

  if (isSuspectedBugAccount(account)) {
    return {
      tone: "warning",
      label: "疑似 BUG号",
      description: "5 小时额度正常扣量，但每周额度持续未读取",
    };
  }

  const missingQuotaLabel = getMissingQuotaLabel(account);
  if (missingQuotaLabel) {
    return {
      tone: "warning",
      label: "额度需重新登录",
      description: `${missingQuotaLabel}，请重新登录获取`,
    };
  }

  if (limits.spendControlReached) {
    return {
      tone: "danger",
      label: "Credits 支出已受限",
      description: "当前账号已触发 Credits 支出控制",
    };
  }

  const exhaustedLabel = getExhaustedQuotaLabel(account);
  if (exhaustedLabel) {
    return {
      tone: "danger",
      label:
        exhaustedLabel === "两项限额"
          ? "5 小时与周额度已耗尽"
          : `${exhaustedLabel.replace("限额", "额度")}已耗尽`,
      description:
        exhaustedLabel === "两项限额"
          ? "两个额度窗口均需等待重置或使用真实可用的重置卡"
          : "等待对应额度窗口重置或使用真实可用的重置卡",
    };
  }

  if (limits.rateLimitReachedType) {
    return {
      tone: "danger",
      label: "额度已触达上限",
      description: "等待额度窗口重置或使用可用重置卡",
    };
  }

  const values = [remainingPercent(limits.primary), remainingPercent(limits.secondary)]
    .filter((value): value is number => value !== null);
  const lowest = values.length ? Math.min(...values) : null;

  if (lowest !== null && lowest <= 15) {
    return {
      tone: "danger",
      label: "额度即将耗尽",
      description: `最低额度窗口仅剩 ${lowest}%`,
    };
  }

  if (lowest !== null && lowest <= 35) {
    return {
      tone: "warning",
      label: "额度余量偏低",
      description: `最低额度窗口剩余 ${lowest}%`,
    };
  }

  return {
    tone: "healthy",
    label: "账号状态正常",
    description:
      lowest === null ? "登录状态正常" : `最低额度窗口仍有 ${lowest}%`,
  };
}

export function accountNeedsAttention(account: ManagedAccount) {
  return getAccountHealth(account).tone !== "healthy";
}

export function getResetCreditDisplay(credit: ResetCredit) {
  const rawTitle = credit.title?.trim() || "";
  const title = rawTitle.toLocaleLowerCase("en-US");
  const combined = `${title} ${credit.resetType.toLocaleLowerCase("en-US")}`;
  const includesWeekly = /weekly|week|每周|周额度/.test(combined);
  const includesFiveHour = /5\s*(hr|hour)|five.?hour|5\s*小时/.test(combined);

  if (/full reset|完整.*重置/.test(title) || (includesWeekly && includesFiveHour)) {
    return {
      title: "完整额度重置",
      scope: "每周额度 + 5 小时额度",
    };
  }

  if (includesWeekly) {
    return {
      title: "每周额度重置",
      scope: "每周额度窗口",
    };
  }

  if (includesFiveHour) {
    return {
      title: "5 小时额度重置",
      scope: "5 小时额度窗口",
    };
  }

  return {
    title: rawTitle || "Codex 额度重置",
    scope: credit.description?.trim() || "符合条件的 Codex 额度窗口",
  };
}

export function getResetOutcomeText(outcome: ResetOutcome) {
  const messages: Record<ResetOutcome, string> = {
    reset: "额度已重置",
    nothingToReset: "当前额度无需重置",
    noCredit: "没有可用的重置卡",
    alreadyRedeemed: "这次重置已经完成",
  };
  return messages[outcome];
}

export function accountSearchText(account: ManagedAccount) {
  return [
    account.label,
    getAccountEmail(account),
    getPlanLabel(getAccountPlan(account)),
  ]
    .join(" ")
    .toLocaleLowerCase("zh-CN");
}
