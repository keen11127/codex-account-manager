import type {
  BulkResetItemResult,
  CodexManagerBridge,
  ManagedAccount,
  ResetCredit,
} from "./types";

const now = Math.floor(Date.now() / 1000);

const resetCredit: ResetCredit = {
  id: "demo-reset-001",
  status: "available",
  resetType: "codexRateLimits",
  title: "Codex 额度重置",
  description: "可重置当前符合条件的 Codex 限额窗口",
  grantedAt: now - 2 * 86400,
  expiresAt: now + 18 * 86400,
};

const weeklyResetCredit: ResetCredit = {
  id: "demo-reset-002",
  status: "available",
  resetType: "codexRateLimits",
  title: "Full reset (Weekly + 5 hr)",
  description: null,
  grantedAt: now - 86400,
  expiresAt: now + 8 * 86400,
};

let accounts: ManagedAccount[] = [
  {
    id: "demo-a",
    label: "主力开发",
    codexHome: "D:\\codex-account-manager-data\\profiles\\demo-a\\codex-home",
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 55000).toISOString(),
    status: "connected",
    account: { type: "chatgpt", email: "alex@example.com", planType: "pro" },
    rateLimitData: {
      accountId: "workspace-a",
      rateLimits: {
        limitId: "codex",
        limitName: "Codex",
        planType: "pro",
        primary: {
          usedPercent: 28,
          resetsAt: now + 2 * 3600 + 17 * 60,
          windowDurationMins: 300,
        },
        secondary: {
          usedPercent: 81,
          resetsAt: now + 3 * 86400 + 4 * 3600,
          windowDurationMins: 10080,
        },
        credits: { balance: "125", hasCredits: true, unlimited: false },
        individualLimit: null,
        rateLimitReachedType: null,
        spendControlReached: false,
      },
      rateLimitResetCredits: { availableCount: 1, credits: [resetCredit] },
      quotaReadStatus: {
        attemptedAt: new Date().toISOString(),
        attempts: 3,
        missingQuotaTypes: ["secondary"],
        cachedQuotaTypes: ["secondary"],
      },
    },
    usageStats: {
      officialResetCount: 1,
      officialPrimaryResetCount: 0,
      officialSecondaryResetCount: 0,
      resetCreditUseCount: 0,
      lastObservedAt: new Date(Date.now() - 55000).toISOString(),
      lastOfficialResetAt: new Date(Date.now() - 5 * 3600000).toISOString(),
      lastResetCreditUsedAt: null,
      events: [
        {
          id: "demo-unexpected-reset-a",
          type: "unexpected-official-reset",
          occurredAt: new Date(Date.now() - 5 * 3600000).toISOString(),
          previousResetAt: now + 3 * 86400,
          nextResetAt: now + 7 * 86400,
          count: 1,
        },
      ],
    },
    lastError: null,
  },
  {
    id: "demo-b",
    label: "项目协作",
    codexHome: "D:\\codex-account-manager-data\\profiles\\demo-b\\codex-home",
    createdAt: new Date(Date.now() - 9 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 240000).toISOString(),
    status: "connected",
    account: {
      type: "chatgpt",
      email: "team@example.com",
      planType: "business",
    },
    rateLimitData: {
      accountId: "workspace-b",
      rateLimits: {
        limitId: "codex",
        limitName: "Codex",
        planType: "business",
        primary: {
          usedPercent: 64,
          resetsAt: now + 47 * 60,
          windowDurationMins: 300,
        },
        secondary: {
          usedPercent: 100,
          resetsAt: now + 5 * 86400 + 2 * 3600,
          windowDurationMins: 10080,
        },
        credits: { balance: "820", hasCredits: true, unlimited: false },
        individualLimit: null,
        rateLimitReachedType: null,
        spendControlReached: false,
      },
      rateLimitResetCredits: {
        availableCount: 1,
        credits: [weeklyResetCredit],
      },
    },
    usageStats: {
      officialResetCount: 0,
      officialPrimaryResetCount: 0,
      officialSecondaryResetCount: 0,
      resetCreditUseCount: 1,
      lastObservedAt: new Date(Date.now() - 240000).toISOString(),
      lastOfficialResetAt: null,
      lastResetCreditUsedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      events: [],
    },
    lastError: null,
  },
  {
    id: "demo-c",
    label: "备用账号",
    codexHome: "D:\\codex-account-manager-data\\profiles\\demo-c\\codex-home",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    status: "signed-out",
    account: null,
    rateLimitData: null,
    usageStats: {
      officialResetCount: 0,
      officialPrimaryResetCount: 0,
      officialSecondaryResetCount: 0,
      resetCreditUseCount: 0,
      lastObservedAt: null,
      lastOfficialResetAt: null,
      lastResetCreditUsedAt: null,
      events: [],
    },
    lastError: null,
  },
];

const delay = (milliseconds = 220) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const mockBridge: CodexManagerBridge = {
  isDesktop: false,
  async listAccounts() {
    await delay(100);
    return structuredClone(accounts);
  },
  async createAccount(label) {
    const cleanedLabel = label.trim();
    const account: ManagedAccount = {
      id: crypto.randomUUID(),
      label: cleanedLabel || "新账号",
      labelSource: cleanedLabel ? "custom" : "email",
      codexHome: "D:\\codex-account-manager-data\\profiles\\new\\codex-home",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "signed-out",
      account: null,
      rateLimitData: null,
      usageStats: {
        officialResetCount: 0,
        officialPrimaryResetCount: 0,
        officialSecondaryResetCount: 0,
        resetCreditUseCount: 0,
        lastObservedAt: null,
        lastOfficialResetAt: null,
        lastResetCreditUsedAt: null,
        events: [],
      },
      lastError: null,
    };
    accounts = [account, ...accounts];
    await delay();
    return structuredClone(account);
  },
  async refreshAccount(id) {
    await delay(450);
    const account = accounts.find((entry) => entry.id === id);
    if (!account) throw new Error("账号不存在");
    account.updatedAt = new Date().toISOString();
    return structuredClone(account);
  },
  async refreshAll() {
    await delay(600);
    accounts = accounts.map((entry) => ({
      ...entry,
      updatedAt: new Date().toISOString(),
    }));
    return structuredClone(accounts);
  },
  async loginAccount(id) {
    await delay(900);
    const account = accounts.find((entry) => entry.id === id);
    if (!account) throw new Error("账号不存在");
    account.status = "connected";
    account.account = {
      type: "chatgpt",
      email: "new@example.com",
      planType: "plus",
    };
    if (account.labelSource === "email") account.label = "new";
    account.rateLimitData = {
      accountId: "workspace-new",
      rateLimits: {
        limitId: "codex",
        limitName: "Codex",
        planType: "plus",
        primary: {
          usedPercent: 0,
          resetsAt: now + 5 * 3600,
          windowDurationMins: 300,
        },
        secondary: {
          usedPercent: 0,
          resetsAt: now + 7 * 86400,
          windowDurationMins: 10080,
        },
        credits: null,
        individualLimit: null,
        rateLimitReachedType: null,
        spendControlReached: false,
      },
      rateLimitResetCredits: { availableCount: 0, credits: [] },
    };
    account.updatedAt = new Date().toISOString();
    return structuredClone(account);
  },
  async renameAccount(id, label) {
    const account = accounts.find((entry) => entry.id === id);
    if (!account) throw new Error("账号不存在");
    const cleanedLabel = label.trim();
    account.label = cleanedLabel || "new";
    account.labelSource = cleanedLabel ? "custom" : "email";
    return structuredClone(account);
  },
  async removeAccount(id) {
    accounts = accounts.filter((entry) => entry.id !== id);
    await delay();
    return { removed: true, cleanupDeferred: false };
  },
  async consumeResetCredit(id) {
    await delay(700);
    const account = accounts.find((entry) => entry.id === id);
    if (!account) throw new Error("账号不存在");
    if (account.rateLimitData?.rateLimitResetCredits) {
      account.rateLimitData.rateLimitResetCredits = {
        availableCount: 0,
        credits: [],
      };
    }
    if (account.rateLimitData?.rateLimits?.primary) {
      account.rateLimitData.rateLimits.primary.usedPercent = 0;
    }
    if (account.rateLimitData?.rateLimits?.secondary) {
      account.rateLimitData.rateLimits.secondary.usedPercent = 0;
    }
    if (account.usageStats) {
      account.usageStats.resetCreditUseCount += 1;
      account.usageStats.lastResetCreditUsedAt = new Date().toISOString();
    }
    return { outcome: "reset", account: structuredClone(account) };
  },
  async consumeResetCredits(targets) {
    const results: BulkResetItemResult[] = [];
    for (const target of targets) {
      const account = accounts.find((entry) => entry.id === target.accountId);
      if (!account) {
        results.push({
          accountId: target.accountId,
          outcome: null,
          error: "账号不存在",
        });
        continue;
      }

      if (account.rateLimitData?.rateLimitResetCredits) {
        account.rateLimitData.rateLimitResetCredits = {
          availableCount: 0,
          credits: [],
        };
      }
      if (account.rateLimitData?.rateLimits?.primary) {
        account.rateLimitData.rateLimits.primary.usedPercent = 0;
      }
      if (account.rateLimitData?.rateLimits?.secondary) {
        account.rateLimitData.rateLimits.secondary.usedPercent = 0;
      }
      if (account.usageStats) {
        account.usageStats.resetCreditUseCount += 1;
        account.usageStats.lastResetCreditUsedAt = new Date().toISOString();
      }
      results.push({ accountId: target.accountId, outcome: "reset", error: null });
    }
    await delay(700);
    return { results, accounts: structuredClone(accounts) };
  },
  async launchCodex() {
    return true;
  },
  async openProfile() {
    return "";
  },
  async openDataDirectory() {
    return "";
  },
  async openUsage() {},
  async openCodexWeb() {},
  async openOfficialChannel() {
    window.open("https://t.me/renminpin", "_blank", "noopener,noreferrer");
  },
  async openVpnSponsor() {
    window.open("https://renminde.com", "_blank", "noopener,noreferrer");
  },
  async getSystemInfo() {
    return {
      appVersion: "0.2.13",
      codexFound: true,
      codexVersion: "codex-cli 0.153.4",
      dataDirectory: "D:\\codex-account-manager-data",
    };
  },
  reportError(error) {
    console.error(error);
  },
};
