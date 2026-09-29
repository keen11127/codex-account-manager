import type {
  BulkResetItemResult,
  CodexManagerBridge,
  ExtensionInventory,
  ManagedAccount,
  PromptLibrary,
  ProviderInventory,
  ResetCredit,
} from "./types";

const now = Math.floor(Date.now() / 1000);

const mockFiles = {
  instructions: `# 全局协作规则\n\n- 优先复用项目现有结构。\n- 修改后运行测试并说明结果。\n`,
  config: `model = "gpt-6-sol"\n\n[mcp_servers.docs]\ncommand = "npx"\nargs = ["-y", "docs-mcp"]\n`,
  auth: `{\n  "auth_mode": "chatgpt",\n  "tokens": {\n    "access_token": "preview-token"\n  }\n}\n`,
};

let mockSessions = [
  {
    id: "2026/09/29/session-demo-1.jsonl",
    name: "session-demo-1",
    updatedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    sizeBytes: 184_320,
    projectPath: "D:\\projects\\dashboard",
    model: "gpt-6-sol",
    provider: "official",
  },
  {
    id: "2026/09/28/session-demo-2.jsonl",
    name: "session-demo-2",
    updatedAt: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
    sizeBytes: 92_410,
    projectPath: "D:\\projects\\client",
    model: "gpt-6-luna",
    provider: "team-api",
  },
];

let mockPromptLibrary: PromptLibrary = {
  mode: "append",
  activeIds: ["engineering"],
  instructionsPath: "D:\\codex-home\\AGENTS.md",
  categories: ["软件开发", "代码审查", "逆向模板", "自定义"],
  lastSyncedAt: new Date(Date.now() - 86_400_000).toISOString(),
  prompts: [
    { id: "engineering", title: "严谨工程执行", category: "软件开发", description: "先理解结构，再完成实现与验证。", content: "# 严谨工程执行", source: "builtin", updatedAt: new Date().toISOString() },
    { id: "review", title: "严格代码审查", category: "代码审查", description: "发现行为缺陷、回归风险与测试缺口。", content: "# 严格代码审查", source: "builtin", updatedAt: new Date().toISOString() },
    { id: "reverse", title: "GPT-5.6 Sol 深度分析模板", category: "逆向模板", description: "面向复杂项目的完整分析与执行指令模板。", content: "# 深度分析模板", source: "builtin", updatedAt: new Date().toISOString() },
    { id: "custom", title: "项目维护规则", category: "自定义", description: "团队本地维护约定。", content: "# 项目维护规则", source: "custom", updatedAt: new Date().toISOString() },
  ],
};

let mockProviderInventory: ProviderInventory = {
  activeId: "official",
  official: { id: "official", name: "OpenAI 官方登录", active: true, authReady: true },
  profiles: [
    { id: "team-api", name: "团队 API", baseUrl: "https://api.example.test/v1", model: "gpt-6-sol", wireApi: "responses", requiresOpenaiAuth: false, apiKeySet: true, apiKeyHint: "sk-***emo", tomlConfig: "", notes: "主线路", contextWindow: null, modelMappings: [], active: false, updatedAt: new Date().toISOString() },
  ],
  routing: { enabled: false, takeover: false, autoFailover: false, listenAddress: "127.0.0.1", listenPort: 15721, providerIds: ["team-api"], maxRetries: 3, firstByteTimeout: 60, idleTimeout: 120, requestTimeout: 600, failureThreshold: 4, successThreshold: 2, errorRateThreshold: 60, minimumRequests: 5, recoverySeconds: 60 },
};

let mockExtensions: ExtensionInventory = {
  skills: [
    { id: "document-tools", name: "document-tools", enabled: true, canToggle: true, description: "文档读取与结构化处理工具", note: "常用", sourceUrl: "https://example.test/document-tools", updateStatus: "current", currentRef: "abc", latestRef: "abc", updateCheckedAt: new Date().toISOString() },
    { id: "browser-automation", name: "browser-automation", enabled: false, canToggle: true, description: "浏览器自动化工作流", note: "", sourceUrl: null, updateStatus: "unsupported", currentRef: null, latestRef: null, updateCheckedAt: new Date().toISOString() },
  ],
  mcpServers: [{ name: "docs", transport: "本地进程", target: "npx", enabled: true }],
  skillsDirectory: "D:\\codex-home\\skills",
  disabledSkillsDirectory: "D:\\codex-home\\skills-disabled",
};

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
  async openRepository() {
    window.open(
      "https://github.com/keen11127/codex-account-manager",
      "_blank",
      "noopener,noreferrer",
    );
  },
  async readManagedFile(_id, kind) {
    return {
      kind,
      path: kind === "instructions"
        ? "D:\\codex-home\\AGENTS.md"
        : kind === "auth"
          ? "D:\\codex-home\\auth.json"
          : "D:\\codex-home\\config.toml",
      exists: true,
      content: mockFiles[kind],
      updatedAt: new Date().toISOString(),
    };
  },
  async writeManagedFile(_id, kind, content) {
    mockFiles[kind] = content;
    return {
      kind,
      path: kind === "instructions"
        ? "D:\\codex-home\\AGENTS.md"
        : kind === "auth"
          ? "D:\\codex-home\\auth.json"
          : "D:\\codex-home\\config.toml",
      exists: true,
      content,
      updatedAt: new Date().toISOString(),
      backupPath: `D:\\codex-home\\backups\\${kind}.bak`,
    };
  },
  async listExtensions() {
    return structuredClone(mockExtensions);
  },
  async toggleSkill(_id, skillId, enabled) {
    const inventory = await this.listExtensions(_id);
    const target = inventory.skills.find((skill) => skill.id === skillId);
    if (target) target.enabled = enabled;
    mockExtensions = structuredClone(inventory);
    return inventory;
  },
  async listSessions() {
    return structuredClone(mockSessions);
  },
  async deleteSession(_id, sessionId) {
    mockSessions = mockSessions.filter((session) => session.id !== sessionId);
    return structuredClone(mockSessions);
  },
  async openSessionLocation() {
    return true;
  },
  async openToolPath() {
    return "";
  },
  async listPrompts() { return structuredClone(mockPromptLibrary); },
  async savePrompt(_id, input) {
    const id = input.id || crypto.randomUUID();
    const index = mockPromptLibrary.prompts.findIndex((item) => item.id === id);
    const next = { id, title: input.title || "未命名提示词", category: input.category || "自定义", description: input.description || "", content: input.content || "", source: input.source === "builtin" ? "builtin" as const : "custom" as const, updatedAt: new Date().toISOString() };
    if (index >= 0) mockPromptLibrary.prompts[index] = next; else mockPromptLibrary.prompts.push(next);
    return structuredClone(mockPromptLibrary);
  },
  async deletePrompt(_id, promptId) { mockPromptLibrary.prompts = mockPromptLibrary.prompts.filter((item) => item.id !== promptId); mockPromptLibrary.activeIds = mockPromptLibrary.activeIds.filter((id) => id !== promptId); return structuredClone(mockPromptLibrary); },
  async togglePrompt(_id, promptId, enabled) { mockPromptLibrary.activeIds = enabled ? [promptId] : mockPromptLibrary.activeIds.filter((id) => id !== promptId); return structuredClone(mockPromptLibrary); },
  async setPromptMode(_id, mode) { mockPromptLibrary.mode = mode; mockPromptLibrary.instructionsPath = mode === "replace" && mockPromptLibrary.activeIds.length ? "D:\\codex-home\\.account-manager\\active-instructions.md" : "D:\\codex-home\\AGENTS.md"; return structuredClone(mockPromptLibrary); },
  async syncPromptCatalog() { mockPromptLibrary.lastSyncedAt = new Date().toISOString(); return { library: structuredClone(mockPromptLibrary), added: 0, updated: 1, preserved: 0 }; },
  async savePromptCategory(_id, previousName, nextName) { if (previousName) { mockPromptLibrary.categories = mockPromptLibrary.categories.map((item) => item === previousName ? nextName : item); mockPromptLibrary.prompts.forEach((item) => { if (item.category === previousName) item.category = nextName; }); } else if (!mockPromptLibrary.categories.includes(nextName)) mockPromptLibrary.categories.push(nextName); return structuredClone(mockPromptLibrary); },
  async deletePromptCategory(_id, name) { mockPromptLibrary.categories = mockPromptLibrary.categories.filter((item) => item !== name); mockPromptLibrary.prompts.forEach((item) => { if (item.category === name) item.category = "未分类"; }); if (!mockPromptLibrary.categories.includes("未分类")) mockPromptLibrary.categories.push("未分类"); return structuredClone(mockPromptLibrary); },
  async importPrompt() { return null; },
  async listProviders() { return structuredClone(mockProviderInventory); },
  async saveProvider(_id, input) { const id = input.id || crypto.randomUUID(); const existing = mockProviderInventory.profiles.find((item) => item.id === id); const next = { id, name: input.name, baseUrl: input.baseUrl, model: input.model, wireApi: input.wireApi, requiresOpenaiAuth: input.requiresOpenaiAuth, apiKeySet: Boolean(input.apiKey || existing?.apiKeySet), apiKeyHint: input.apiKey ? "sk-***emo" : existing?.apiKeyHint || null, tomlConfig: input.tomlConfig || "", notes: input.notes || existing?.notes || "", contextWindow: input.contextWindow === 1_000_000 ? 1_000_000 : null, modelMappings: input.modelMappings || existing?.modelMappings || [], active: existing?.active || false, updatedAt: new Date().toISOString() }; mockProviderInventory.profiles = [...mockProviderInventory.profiles.filter((item) => item.id !== id), next]; return structuredClone(mockProviderInventory); },
  async duplicateProvider(_id, providerId) { const source = mockProviderInventory.profiles.find((item) => item.id === providerId); if (source) mockProviderInventory.profiles.push({ ...source, id: crypto.randomUUID(), name: `${source.name} 副本`, active: false }); return structuredClone(mockProviderInventory); },
  async activateProvider(_id, providerId) { mockProviderInventory.activeId = providerId; mockProviderInventory.official.active = providerId === "official"; mockProviderInventory.profiles.forEach((item) => { item.active = item.id === providerId; }); return structuredClone(mockProviderInventory); },
  async deleteProvider(_id, providerId) { mockProviderInventory.profiles = mockProviderInventory.profiles.filter((item) => item.id !== providerId); return structuredClone(mockProviderInventory); },
  async testProvider() { return { ok: true, status: 200, elapsedMs: 128, models: ["gpt-6-sol"], message: "连接正常" }; },
  async importProviderDatabase() { return { databasePath: "D:\\provider.db", imported: 1, added: 1, updated: 0, merged: 0, skipped: 0, warnings: [], inventory: structuredClone(mockProviderInventory) }; },
  async setContextWindow(_id, enabled) { return { enabled, file: await this.readManagedFile("", "config") }; },
  async saveRouting(_id, settings) { mockProviderInventory.routing = settings; return structuredClone(mockProviderInventory); },
  async getRouterStatus() { return { running: mockProviderInventory.routing.enabled, takeoverActive: mockProviderInventory.routing.enabled && mockProviderInventory.routing.takeover, address: mockProviderInventory.routing.enabled ? "http://127.0.0.1:15721/v1" : null, settings: structuredClone(mockProviderInventory.routing), runtime: { requestCount: 28, failoverCount: 1, inFlight: 0, successCount: 27, failureCount: 1, uptimeSeconds: 1200, lastRequestAt: new Date().toISOString(), lastProviderId: "team-api", lastError: null, providers: [{ id: "team-api", state: "closed", cooldownSeconds: 0, lastStatus: 200, consecutiveFailures: 0, consecutiveSuccesses: 4, totalRequests: 28, failedRequests: 1, errorRate: 4 }] } }; },
  async resetRouterHealth() { return this.getRouterStatus(""); },
  async toggleMcp(_id, name, enabled) { const target = mockExtensions.mcpServers.find((item) => item.name === name); if (target) target.enabled = enabled; return structuredClone(mockExtensions); },
  async saveExtensionNote(_id, kind, extensionId, note) { if (kind === "skill") { const target = mockExtensions.skills.find((item) => item.id === extensionId); if (target) target.note = note; } else { const target = mockExtensions.mcpServers.find((item) => item.name === extensionId); if (target) target.note = note; } return structuredClone(mockExtensions); },
  async checkSkillUpdates() { mockExtensions.lastUpdateCheckAt = new Date().toISOString(); return structuredClone(mockExtensions); },
  async updateSkill() { return structuredClone(mockExtensions); },
  async installSkillZip() { return null; },
  async previewExistingWorkspace() { return { sourceHome: "D:\\Users\\demo\\.codex", skills: [{ id: "sample", exists: false }], mcpServers: [{ name: "sample", transport: "本地进程", target: "npx", exists: false }] }; },
  async importExistingWorkspace() { return { importedSkills: 0, importedMcp: 0, inventory: structuredClone(mockExtensions) }; },
  async exportWorkspace() { return null; },
  async deleteSessions(_id, sessionIds) { mockSessions = mockSessions.filter((item) => !sessionIds.includes(item.id)); return structuredClone(mockSessions); },
  async exportSessions() { return null; },
  async getSessionStatus() { return { target: { provider: "official", model: "gpt-6-sol" }, sessions: structuredClone(mockSessions).map((item, index) => ({ ...item, syncStatus: index === 0 ? "current" as const : "outdated" as const, syncDetail: index === 0 ? "与当前配置一致" : "当前配置：official / gpt-6-sol" })) }; },
  async syncSessions(_id, sessionIds) { return { changed: sessionIds.length, skipped: 0, errors: [], status: await this.getSessionStatus("") }; },
  async exportSessionsMarkdown() { return null; },
  async listBackups() { return [{ id: "config.toml.demo.bak", kind: "config", name: "config.toml.2026-09-29.bak", createdAt: new Date(Date.now() - 3600000).toISOString(), sizeBytes: 2840 }]; },
  async restoreBackup() { return { restored: { kind: "config", path: "D:\\codex-home\\config.toml", exists: true, content: mockFiles.config, updatedAt: new Date().toISOString() }, backups: await this.listBackups("") }; },
  async runDiagnostics() { return { checkedAt: new Date().toISOString(), codexHome: "D:\\codex-home", status: "ok", checks: [{ id: "auth", label: "登录文件", status: "ok", detail: "auth.json 可读取", action: "relogin" }, { id: "config", label: "Codex 配置", status: "ok", detail: "config.toml 可读取", action: "open-config" }, { id: "skills", label: "Skills", status: "ok", detail: "1 个启用，1 个停用", action: "open-skills" }, { id: "sessions", label: "本地会话", status: "ok", detail: "2 个会话可管理", action: "open-sessions" }] }; },
  async checkConfigHealth() { return { status: "healthy", checkedAt: new Date().toISOString(), fingerprint: "demo", canRepair: false, issues: [], repairSummary: [] }; },
  async repairConfigHealth() { return { changed: false, report: await this.checkConfigHealth(""), backupPath: null }; },
  async checkForUpdate() {
    return {
      currentVersion: "0.4.0",
      latestVersion: "0.4.1",
      hasUpdate: true,
      publishedAt: new Date().toISOString(),
      notes: "界面预览更新",
      downloadUrl: "https://example.test/setup.exe",
      assetName: "Codex Account Manager-0.4.1-x64-setup.exe",
      checksumUrl: "https://example.test/SHA256SUMS.txt",
      releaseUrl: "https://github.com/keen11127/codex-account-manager/releases",
    };
  },
  async installUpdate() {
    return {
      filePath: "D:\\codex-account-manager-data\\updates\\setup.exe",
      fileName: "setup.exe",
      bytes: 100,
      sha256: "DEMO",
      isInstaller: true,
      launched: true,
    };
  },
  async openDownloads() {
    window.open(
      "https://github.com/keen11127/codex-account-manager/releases",
      "_blank",
      "noopener,noreferrer",
    );
  },
  async getSystemInfo() {
    return {
      appVersion: "0.4.0",
      codexFound: true,
      codexVersion: "codex-cli 0.153.4",
      dataDirectory: "D:\\codex-account-manager-data",
    };
  },
  reportError(error) {
    console.error(error);
  },
};
