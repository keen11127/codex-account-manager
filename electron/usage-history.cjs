const { randomUUID } = require("node:crypto");

const MAX_EVENTS = 200;
const MAX_RESET_ADVANCE_COUNT = 500;
const RESET_DROP_THRESHOLD = 5;
const RESET_DUE_TOLERANCE_SECONDS = 5 * 60;
const UNEXPECTED_RESET_EARLY_SECONDS = 30 * 60;
const FULLY_RESTORED_USED_PERCENT = 1;

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object") return null;
  if (
    event.type !== "unexpected-official-reset"
  ) {
    return null;
  }

  return {
    id: String(event.id || randomUUID()),
    type: event.type,
    occurredAt: String(event.occurredAt || new Date().toISOString()),
    previousResetAt: Number.isFinite(event.previousResetAt)
      ? event.previousResetAt
      : null,
    nextResetAt: Number.isFinite(event.nextResetAt) ? event.nextResetAt : null,
    count: Math.max(1, finiteCount(event.count) || 1),
  };
}

function normalizeUsageStats(stats) {
  const events = Array.isArray(stats?.events)
    ? stats.events.map(normalizeEvent).filter(Boolean).slice(0, MAX_EVENTS)
    : [];
  const lastOfficialResetAt = events
    .map((event) => event.occurredAt)
    .sort()
    .at(-1) || null;

  return {
    officialResetCount: events.length,
    officialPrimaryResetCount: 0,
    officialSecondaryResetCount: 0,
    resetCreditUseCount: finiteCount(stats?.resetCreditUseCount),
    lastObservedAt: stats?.lastObservedAt || null,
    lastOfficialResetAt,
    lastResetCreditUsedAt: stats?.lastResetCreditUsedAt || null,
    events,
  };
}

function getWindowResetCount(previous, next, nowSeconds) {
  if (!previous || !next) return 0;
  if (!Number.isFinite(previous.resetsAt) || !Number.isFinite(next.resetsAt)) {
    return 0;
  }

  const resetWindowAdvanced = next.resetsAt > previous.resetsAt + 60;
  const usageDropped = previous.usedPercent - next.usedPercent >= RESET_DROP_THRESHOLD;
  const previousWindowWasDue =
    previous.resetsAt <= nowSeconds + RESET_DUE_TOLERANCE_SECONDS;

  if (!resetWindowAdvanced || (!usageDropped && !previousWindowWasDue)) {
    return 0;
  }

  const durationMinutes = Number(
    next.windowDurationMins || previous.windowDurationMins,
  );
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 1;

  const windowSeconds = durationMinutes * 60;
  const resetAdvanceSeconds = next.resetsAt - previous.resetsAt;
  return Math.min(
    MAX_RESET_ADVANCE_COUNT,
    Math.max(1, Math.round(resetAdvanceSeconds / windowSeconds)),
  );
}

function didWindowReset(previous, next, nowSeconds) {
  return getWindowResetCount(previous, next, nowSeconds) > 0;
}

function didUnexpectedFullReset(previous, next, nowSeconds) {
  const previousPrimary = previous?.primary;
  const previousSecondary = previous?.secondary;
  const nextPrimary = next?.primary;
  const nextSecondary = next?.secondary;
  if (
    !previousPrimary ||
    !previousSecondary ||
    !nextPrimary ||
    !nextSecondary
  ) {
    return false;
  }

  const allWindowsFull =
    nextPrimary.usedPercent <= FULLY_RESTORED_USED_PERCENT &&
    nextSecondary.usedPercent <= FULLY_RESTORED_USED_PERCENT;
  if (!allWindowsFull) return false;

  return [
    [previousPrimary, nextPrimary],
    [previousSecondary, nextSecondary],
  ].some(
    ([previousWindow, nextWindow]) =>
      previousWindow.usedPercent - nextWindow.usedPercent >=
        RESET_DROP_THRESHOLD &&
      Number.isFinite(previousWindow.resetsAt) &&
      previousWindow.resetsAt > nowSeconds + UNEXPECTED_RESET_EARLY_SECONDS,
  );
}

function addEvent(
  stats,
  type,
  previousWindow,
  nextWindow,
  occurredAt,
  count = 1,
) {
  stats.events = [
    {
      id: randomUUID(),
      type,
      occurredAt,
      previousResetAt: previousWindow?.resetsAt ?? null,
      nextResetAt: nextWindow?.resetsAt ?? null,
      count,
    },
    ...stats.events,
  ].slice(0, MAX_EVENTS);
}

function getResetOccurrenceTimes(previousWindow, nextWindow, count) {
  if (!previousWindow || count <= 0) return [];
  const firstResetAt = Number(previousWindow.resetsAt);
  if (!Number.isFinite(firstResetAt)) return [];
  const durationMinutes = Number(
    nextWindow?.windowDurationMins || previousWindow.windowDurationMins,
  );
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return [new Date(firstResetAt * 1000).toISOString()];
  }
  const durationSeconds = durationMinutes * 60;
  return Array.from({ length: Math.min(count, MAX_EVENTS) }, (_, index) =>
    new Date((firstResetAt + index * durationSeconds) * 1000).toISOString(),
  );
}

function addOfficialResetEvents(
  stats,
  type,
  previousWindow,
  nextWindow,
  count,
) {
  const occurrenceTimes = getResetOccurrenceTimes(
    previousWindow,
    nextWindow,
    count,
  );
  for (const resetAt of occurrenceTimes) {
    addEvent(stats, type, previousWindow, nextWindow, resetAt);
  }
  return occurrenceTimes.at(-1) || null;
}

function updateUsageStats(
  storedAccount,
  nextRateLimitData,
  source,
  outcome = null,
  nowMs = Date.now(),
) {
  const stats = normalizeUsageStats(storedAccount?.usageStats);
  const occurredAt = new Date(nowMs).toISOString();
  stats.lastObservedAt = occurredAt;

  if (source === "reset-credit") {
    if (outcome === "reset") {
      stats.resetCreditUseCount += 1;
      stats.lastResetCreditUsedAt = occurredAt;
    }
    return stats;
  }

  if (source !== "refresh") return stats;

  const previous = storedAccount?.rateLimitData?.rateLimits;
  const next = nextRateLimitData?.rateLimits;
  const nowSeconds = Math.floor(nowMs / 1000);

  if (didUnexpectedFullReset(previous, next, nowSeconds)) {
    stats.officialResetCount += 1;
    stats.lastOfficialResetAt = occurredAt;
    addEvent(
      stats,
      "unexpected-official-reset",
      previous.secondary,
      next.secondary,
      occurredAt,
    );
  }

  return stats;
}

module.exports = {
  didWindowReset,
  didUnexpectedFullReset,
  getResetOccurrenceTimes,
  getWindowResetCount,
  normalizeUsageStats,
  updateUsageStats,
};
