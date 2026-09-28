const QUOTA_TYPES = ["primary", "secondary"];

function getMissingQuotaTypes(rateLimitData) {
  const limits = rateLimitData?.rateLimits;
  return QUOTA_TYPES.filter((type) => !limits?.[type]);
}

function mergeQuotaReads(previousRead, nextRead) {
  if (!previousRead) return nextRead;
  if (!nextRead) return previousRead;

  const previousLimits = previousRead.rateLimits;
  const nextLimits = nextRead.rateLimits;
  return {
    ...previousRead,
    ...nextRead,
    rateLimitResetCredits:
      nextRead.rateLimitResetCredits ??
      previousRead.rateLimitResetCredits ??
      null,
    rateLimits:
      previousLimits || nextLimits
        ? {
            ...(previousLimits || {}),
            ...(nextLimits || {}),
            primary: nextLimits?.primary || previousLimits?.primary || null,
            secondary: nextLimits?.secondary || previousLimits?.secondary || null,
          }
        : null,
  };
}

function finalizeQuotaRead(currentRead, storedRead, attempts, attemptedAt) {
  const missingQuotaTypes = getMissingQuotaTypes(currentRead);
  const cachedQuotaTypes = missingQuotaTypes.filter(
    (type) => Boolean(storedRead?.rateLimits?.[type]),
  );
  const currentLimits = currentRead?.rateLimits;
  const storedLimits = storedRead?.rateLimits;
  const rateLimits =
    currentLimits || cachedQuotaTypes.length > 0
      ? {
          ...(currentLimits || storedLimits || {}),
          primary:
            currentLimits?.primary ||
            (cachedQuotaTypes.includes("primary")
              ? storedLimits?.primary
              : null) ||
            null,
          secondary:
            currentLimits?.secondary ||
            (cachedQuotaTypes.includes("secondary")
              ? storedLimits?.secondary
              : null) ||
            null,
        }
      : null;

  return {
    ...(currentRead || {
      accountId: storedRead?.accountId || null,
      rateLimitResetCredits: null,
    }),
    rateLimits,
    quotaReadStatus: {
      attemptedAt,
      attempts,
      missingQuotaTypes,
      cachedQuotaTypes,
    },
  };
}

module.exports = {
  finalizeQuotaRead,
  getMissingQuotaTypes,
  mergeQuotaReads,
};
