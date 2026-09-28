function cleanPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeWindow(window) {
  if (!window) return null;
  return {
    usedPercent: cleanPercent(window.usedPercent),
    resetsAt: finiteNumber(window.resetsAt),
    windowDurationMins: finiteNumber(window.windowDurationMins),
  };
}

function normalizeRateSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    limitId: snapshot.limitId || null,
    limitName: snapshot.limitName || null,
    planType: snapshot.planType || null,
    primary: normalizeWindow(snapshot.primary),
    secondary: normalizeWindow(snapshot.secondary),
    credits: snapshot.credits
      ? {
          balance: snapshot.credits.balance ?? null,
          hasCredits: Boolean(snapshot.credits.hasCredits),
          unlimited: Boolean(snapshot.credits.unlimited),
        }
      : null,
    individualLimit: snapshot.individualLimit
      ? {
          limit: String(snapshot.individualLimit.limit),
          used: String(snapshot.individualLimit.used),
          remainingPercent: cleanPercent(
            snapshot.individualLimit.remainingPercent,
          ),
          resetsAt: finiteNumber(snapshot.individualLimit.resetsAt) ?? 0,
        }
      : null,
    rateLimitReachedType: snapshot.rateLimitReachedType || null,
    spendControlReached:
      typeof snapshot.spendControlReached === "boolean"
        ? snapshot.spendControlReached
        : null,
  };
}

function normalizeResetCredit(credit) {
  if (!credit || typeof credit !== "object") return null;
  if (credit.id === null || credit.id === undefined) return null;

  const id = String(credit.id).trim();
  if (!id) return null;

  const grantedAt = finiteNumber(credit.grantedAt);
  const expiresAt = finiteNumber(credit.expiresAt);
  return {
    id,
    status: String(credit.status || "unknown"),
    resetType: String(credit.resetType || "unknown"),
    title: credit.title || null,
    description: credit.description || null,
    grantedAt: grantedAt ?? 0,
    expiresAt,
  };
}

function normalizeRateLimits(response, nowSeconds = Date.now() / 1000) {
  if (!response) return null;

  const summary = response.rateLimitResetCredits;
  const normalizedCredits = Array.isArray(summary?.credits)
    ? summary.credits.map(normalizeResetCredit).filter(Boolean)
    : null;

  return {
    accountId: response.accountId || null,
    rateLimits: normalizeRateSnapshot(response.rateLimits),
    rateLimitResetCredits: summary
      ? {
          availableCount:
            normalizedCredits?.filter(
              (credit) =>
                credit.status === "available" &&
                (!credit.expiresAt || credit.expiresAt > nowSeconds),
            ).length || 0,
          credits: normalizedCredits,
        }
      : null,
  };
}

module.exports = {
  cleanPercent,
  normalizeRateLimits,
  normalizeRateSnapshot,
  normalizeResetCredit,
  normalizeWindow,
};
