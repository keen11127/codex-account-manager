const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn, execFileSync, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline");
const {
  normalizeUsageStats,
  updateUsageStats,
} = require("./usage-history.cjs");
const {
  createAccountLabel,
  labelAfterLogin,
  renameAccountLabel,
} = require("./account-label.cjs");
const {
  isManagedProfilePath,
  removeProfileDirectory,
} = require("./profile-cleanup.cjs");
const {
  finalizeQuotaRead,
  getMissingQuotaTypes,
  mergeQuotaReads,
} = require("./quota-recovery.cjs");
const {
  loadStoreDocument,
  readStoreDocument,
  writeStoreDocument,
} = require("./account-store.cjs");
const {
  normalizeRateLimits,
} = require("./rate-limit-normalization.cjs");
const {
  createKeyedSerialQueue,
  createSerialQueue,
} = require("./operation-queue.cjs");

const LEGACY_USER_DATA_ROOT = path.join(
  app.getPath("appData"),
  "codex-account-manager",
);
const APP_DATA_ROOT =
  process.platform === "win32"
    ? "D:\\codex-account-manager-data"
    : LEGACY_USER_DATA_ROOT;

if (process.platform === "win32") {
  const sessionDataRoot = path.join(APP_DATA_ROOT, "session-data");
  const crashDumpRoot = path.join(APP_DATA_ROOT, "crash-dumps");
  const logsRoot = path.join(APP_DATA_ROOT, "logs");
  for (const directory of [
    APP_DATA_ROOT,
    sessionDataRoot,
    crashDumpRoot,
    logsRoot,
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  app.setPath("userData", APP_DATA_ROOT);
  app.setPath("sessionData", sessionDataRoot);
  app.setPath("crashDumps", crashDumpRoot);
  app.setAppLogsPath(logsRoot);
}

app.disableHardwareAcceleration();

const APP_VERSION = app.getVersion();
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12 * 1000;
const QUOTA_REQUEST_TIMEOUT_MS = 4 * 1000;
const ORPHAN_CLEANUP_INTERVAL_MS = 60 * 1000;
const QUOTA_RETRY_DELAYS_MS = [0, 350, 800];

let mainWindow = null;
let accountCache = null;
let storeRecoveryError = null;
let orphanCleanupTimer = null;
let orphanCleanupRunning = false;
let refreshAllInFlight = null;
const protectedProfileRoots = new Set();
const activeAppServerClients = new Set();
const storeMutationQueue = createSerialQueue();
const accountOperationQueue = createKeyedSerialQueue();

function profilePathKey(profileRoot) {
  const resolved = path.resolve(profileRoot);
  return process.platform === "win32" ? resolved.toLocaleLowerCase() : resolved;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCodexLaunch() {
  let candidates = [];

  try {
    candidates = execFileSync("where.exe", ["codex"], {
      encoding: "utf8",
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => fs.existsSync(entry));
  } catch {
    candidates = [];
  }

  const executable = candidates.find((entry) => entry.toLowerCase().endsWith(".exe"));
  if (executable) {
    return { command: executable, prefix: [], usesCommandShell: false };
  }

  const commandFile = candidates.find((entry) => entry.toLowerCase().endsWith(".cmd"));
  if (commandFile) {
    return {
      command: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
      prefix: ["/d", "/s", "/c"],
      commandFile,
      usesCommandShell: true,
    };
  }

  return {
    command: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    prefix: ["/d", "/s", "/c"],
    commandFile: "codex",
    usesCommandShell: true,
  };
}

function quoteCommandArgument(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function spawnCodex(args, options = {}) {
  const launch = resolveCodexLaunch();
  if (!launch.usesCommandShell) {
    return spawn(launch.command, args, options);
  }

  const commandLine = [launch.commandFile, ...args]
    .map(quoteCommandArgument)
    .join(" ");

  return spawn(launch.command, [...launch.prefix, commandLine], options);
}

class AppServerClient {
  constructor(codexHome) {
    this.codexHome = codexHome;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.notificationWaiters = new Map();
    this.stderr = "";
    this.closed = false;
    this.usesCommandShell = false;
  }

  async start() {
    if (this.child) return;

    const env = {
      ...process.env,
      CODEX_HOME: this.codexHome,
      NO_COLOR: "1",
    };

    this.child = spawnCodex(["app-server", "--stdio"], {
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeAppServerClients.add(this);

    this.usesCommandShell = resolveCodexLaunch().usesCommandShell;
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-8000);
    });

    const lineReader = readline.createInterface({ input: this.child.stdout });
    lineReader.on("line", (line) => this.handleLine(line));

    this.child.once("error", (error) => this.failAll(error));
    this.child.once("exit", (code) => {
      if (!this.closed && this.pending.size > 0) {
        const detail = this.stderr.trim();
        this.failAll(
          new Error(
            detail || `Codex App Server 已退出，退出码 ${code ?? "unknown"}`,
          ),
        );
      }
    });

    await this.request(
      "initialize",
      {
        clientInfo: {
          name: "codex-account-manager",
          title: "Codex Account Manager",
          version: APP_VERSION,
        },
        capabilities: {
          experimentalApi: true,
        },
      },
      15_000,
    );

    this.notify("initialized");
  }

  handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);

      if (message.error) {
        const errorMessage =
          message.error.message || message.error.data || "Codex 请求失败";
        pending.reject(new Error(String(errorMessage)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      const waiters = this.notificationWaiters.get(message.method) || [];
      for (const waiter of [...waiters]) {
        if (!waiter.predicate || waiter.predicate(message.params)) {
          clearTimeout(waiter.timer);
          waiter.resolve(message.params);
          const current = this.notificationWaiters.get(message.method) || [];
          this.notificationWaiters.set(
            message.method,
            current.filter((entry) => entry !== waiter),
          );
        }
      }
    }
  }

  request(method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!this.child || !this.child.stdin.writable) {
      return Promise.reject(new Error("Codex App Server 尚未启动"));
    }

    const id = this.nextId++;
    const payload = { id, method };
    if (params !== undefined) payload.params = params;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 请求超时`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method, params) {
    if (!this.child || !this.child.stdin.writable) return;
    const payload = { method };
    if (params !== undefined) payload.params = params;
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  waitForNotification(method, predicate, timeoutMs = LOGIN_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const current = this.notificationWaiters.get(method) || [];
          this.notificationWaiters.set(
            method,
            current.filter((entry) => entry !== waiter),
          );
          reject(new Error("登录等待超时，请重新登录"));
        }, timeoutMs),
      };

      const current = this.notificationWaiters.get(method) || [];
      this.notificationWaiters.set(method, [...current, waiter]);
    });
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();

    for (const waiters of this.notificationWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    }
    this.notificationWaiters.clear();
  }

  stop() {
    this.closed = true;
    activeAppServerClients.delete(this);
    this.failAll(new Error("Codex App Server 已关闭"));

    if (!this.child) return;
    const pid = this.child.pid;

    try {
      this.child.stdin.end();
      this.child.kill();
    } catch {
      // The process may already have exited.
    }

    if (this.usesCommandShell && pid) {
      spawnSync("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    }
  }
}

function getStorePathsForRoot(root) {
  return {
    root,
    profiles: path.join(root, "profiles"),
    store: path.join(root, "accounts.json"),
    backup: path.join(root, "accounts.backup.json"),
    temp: path.join(root, "accounts.pending.json"),
  };
}

function getStorePaths() {
  return getStorePathsForRoot(app.getPath("userData"));
}

async function migrateLegacyStore() {
  if (
    process.platform !== "win32" ||
    path.resolve(LEGACY_USER_DATA_ROOT) === path.resolve(APP_DATA_ROOT)
  ) {
    return false;
  }

  const source = getStorePathsForRoot(LEGACY_USER_DATA_ROOT);
  const target = getStorePathsForRoot(APP_DATA_ROOT);
  if (!fs.existsSync(source.store) && !fs.existsSync(source.backup)) return false;
  if (fs.existsSync(target.store) || fs.existsSync(target.backup)) return false;

  let document;
  try {
    document = await readStoreDocument(source.store);
  } catch {
    document = await readStoreDocument(source.backup);
  }

  await fsp.mkdir(target.profiles, { recursive: true });
  if (fs.existsSync(source.profiles)) {
    await fsp.cp(source.profiles, target.profiles, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }

  const accounts = document.accounts.map((account) => ({
    ...account,
    codexHome: path.join(target.profiles, String(account.id), "codex-home"),
  }));
  const migrated = JSON.stringify(
    { ...document, version: Math.max(2, Number(document.version) || 0), accounts },
    null,
    2,
  );
  await fsp.writeFile(target.temp, migrated, "utf8");
  await fsp.copyFile(target.temp, target.store);
  await fsp.copyFile(target.temp, target.backup);
  await fsp.rm(target.temp, { force: true });

  const verified = await readStoreDocument(target.store);
  if (
    verified.accounts.length !== accounts.length ||
    accounts.some((account) => !fs.existsSync(account.codexHome))
  ) {
    throw new Error("账号资料迁移校验失败");
  }
  return true;
}

async function ensureStore() {
  const paths = getStorePaths();
  await loadStoreDocument(paths);
  return paths;
}

async function loadAccounts() {
  if (accountCache) return accountCache;

  try {
    const paths = getStorePaths();
    const { document } = await loadStoreDocument(paths);
    accountCache = document.accounts.map((account) => ({
      ...account,
      usageStats: normalizeUsageStats(account.usageStats),
    }));
    storeRecoveryError = null;
  } catch (error) {
    storeRecoveryError = error;
    throw error;
  }

  return accountCache;
}

function enqueueStoreMutation(task) {
  return storeMutationQueue.run(task);
}

async function persistAccounts(accounts) {
  const paths = await ensureStore();
  await writeStoreDocument(paths, { version: 2, accounts });
  accountCache = accounts;
}

function mutateAccounts(mutator) {
  return enqueueStoreMutation(async () => {
    const current = [...(await loadAccounts())];
    const mutation = await mutator(current);
    await persistAccounts(mutation.accounts);
    return mutation.value;
  });
}

function updateAccount(id, updater) {
  return mutateAccounts((accounts) => {
    const index = accounts.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error("账号不存在");
    const updated = updater(accounts[index]);
    const next = [...accounts];
    next[index] = updated;
    return { accounts: next, value: updated };
  });
}

function normalizeAccount(account) {
  if (!account) return null;
  if (account.type === "chatgpt") {
    return {
      type: "chatgpt",
      email: account.email || null,
      planType: account.planType || "unknown",
    };
  }
  if (account.type === "apiKey") return { type: "apiKey" };
  return { type: String(account.type || "unknown") };
}

async function createAccount(label) {
  const paths = await ensureStore();
  const id = randomUUID();
  const codexHome = path.join(paths.profiles, id, "codex-home");
  const profileRoot = path.dirname(codexHome);
  const accountLabel = createAccountLabel(label);
  protectedProfileRoots.add(profilePathKey(profileRoot));

  try {
    await fsp.mkdir(codexHome, { recursive: true });
    await fsp.writeFile(
      path.join(codexHome, "config.toml"),
      'cli_auth_credentials_store = "file"\n',
      "utf8",
    );

    const now = new Date().toISOString();
    const account = {
      id,
      ...accountLabel,
      codexHome,
      createdAt: now,
      updatedAt: now,
      status: "signed-out",
      account: null,
      rateLimitData: null,
      usageStats: normalizeUsageStats(null),
      lastError: null,
    };

    return await mutateAccounts((accounts) => ({
      accounts: [account, ...accounts],
      value: account,
    }));
  } finally {
    protectedProfileRoots.delete(profilePathKey(profileRoot));
  }
}

async function findAccount(id) {
  const accounts = await loadAccounts();
  const account = accounts.find((entry) => entry.id === id);
  if (!account) throw new Error("账号不存在");
  return account;
}

async function replaceAccount(nextAccount) {
  return updateAccount(nextAccount.id, () => nextAccount);
}

function runAccountOperation(id, operation) {
  return accountOperationQueue.run(id, operation);
}

async function readRateLimitsWithRecovery(client, storedRateLimitData) {
  let bestRead = null;
  let attempts = 0;
  let lastError = null;

  for (const retryDelay of QUOTA_RETRY_DELAYS_MS) {
    if (retryDelay > 0) await delay(retryDelay);
    attempts += 1;
    try {
      const currentRead = normalizeRateLimits(
        await client.request(
          "account/rateLimits/read",
          undefined,
          QUOTA_REQUEST_TIMEOUT_MS,
        ),
      );
      bestRead = mergeQuotaReads(bestRead, currentRead);
      if (getMissingQuotaTypes(bestRead).length === 0) break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!bestRead && lastError) throw lastError;

  return finalizeQuotaRead(
    bestRead,
    storedRateLimitData,
    attempts,
    new Date().toISOString(),
  );
}

async function readAccountSnapshot(client, storedRateLimitData = null) {
  const accountResponse = await client.request("account/read", {
    refreshToken: true,
  });
  const account = normalizeAccount(accountResponse.account);

  let rateLimitData = null;
  if (account?.type === "chatgpt") {
    rateLimitData = await readRateLimitsWithRecovery(
      client,
      storedRateLimitData,
    );
  }

  return { account, rateLimitData };
}

async function readRefreshedAccount(stored) {
  const client = new AppServerClient(stored.codexHome);

  try {
    await client.start();
    const snapshot = await readAccountSnapshot(client, stored.rateLimitData);
    return {
      ...stored,
      ...snapshot,
      status: snapshot.account ? "connected" : "signed-out",
      updatedAt: new Date().toISOString(),
      usageStats: updateUsageStats(
        stored,
        snapshot.rateLimitData,
        "refresh",
      ),
      lastError: null,
    };
  } finally {
    client.stop();
  }
}

async function refreshAccountUnlocked(id) {
  const stored = await findAccount(id);
  try {
    return await replaceAccount(await readRefreshedAccount(stored));
  } catch (error) {
    await replaceAccount({
      ...stored,
      status: "error",
      updatedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function refreshAccount(id) {
  return runAccountOperation(id, () => refreshAccountUnlocked(id));
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
}

async function refreshAllAccountsUnlocked() {
  const accounts = [...(await loadAccounts())];
  await runWithConcurrency(accounts, 2, async (account) => {
    try {
      await refreshAccount(account.id);
    } catch {
      // refreshAccount already persists an account-level error state.
    }
  });
  return loadAccounts();
}

function refreshAllAccounts() {
  if (refreshAllInFlight) return refreshAllInFlight;
  const operation = refreshAllAccountsUnlocked();
  refreshAllInFlight = operation;
  const clear = () => {
    if (refreshAllInFlight === operation) refreshAllInFlight = null;
  };
  operation.then(clear, clear);
  return operation;
}

async function loginAccountUnlocked(id) {
  const stored = await findAccount(id);
  const client = new AppServerClient(stored.codexHome);

  try {
    await client.start();
    const login = await client.request("account/login/start", {
      type: "chatgpt",
      appBrand: "codex",
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
    });

    if (login.type !== "chatgpt" || !login.authUrl || !login.loginId) {
      throw new Error("Codex 未返回可用的 ChatGPT 登录地址");
    }

    const authUrl = new URL(login.authUrl);
    if (authUrl.protocol !== "https:") {
      throw new Error("登录地址格式异常");
    }

    const completion = client.waitForNotification(
      "account/login/completed",
      (params) => !params.loginId || params.loginId === login.loginId,
    );

    await shell.openExternal(login.authUrl);
    const result = await completion;

    if (!result.success) {
      throw new Error(result.error || "ChatGPT 登录未完成");
    }

    const snapshot = await readAccountSnapshot(client, stored.rateLimitData);
    const accountLabel = labelAfterLogin(stored, snapshot.account?.email);
    return await replaceAccount({
      ...stored,
      ...snapshot,
      ...accountLabel,
      status: "connected",
      updatedAt: new Date().toISOString(),
      usageStats: updateUsageStats(stored, snapshot.rateLimitData, "login"),
      lastError: null,
    });
  } catch (error) {
    await replaceAccount({
      ...stored,
      status: "error",
      updatedAt: new Date().toISOString(),
      lastError: error.message,
    });
    throw error;
  } finally {
    client.stop();
  }
}

function loginAccount(id) {
  return runAccountOperation(id, () => loginAccountUnlocked(id));
}

async function consumeResetCreditUnlocked(id, creditId) {
  const stored = await findAccount(id);
  const credits = stored.rateLimitData?.rateLimitResetCredits?.credits;
  const nowSeconds = Date.now() / 1000;
  const availableCredit = Array.isArray(credits)
    ? credits.find(
        (credit) =>
          credit.id === creditId &&
          credit.status === "available" &&
          (!credit.expiresAt || credit.expiresAt > nowSeconds),
      )
    : null;
  if (!availableCredit) {
    throw new Error("未找到真实可用的重置卡，请刷新账号后重试");
  }
  const client = new AppServerClient(stored.codexHome);

  try {
    await client.start();
    const response = await client.request(
      "account/rateLimitResetCredit/consume",
      {
        creditId: availableCredit.id,
        idempotencyKey: randomUUID(),
      },
    );
    const snapshot = await readAccountSnapshot(client, stored.rateLimitData);
    const account = await replaceAccount({
      ...stored,
      ...snapshot,
      status: "connected",
      updatedAt: new Date().toISOString(),
      usageStats: updateUsageStats(
        stored,
        snapshot.rateLimitData,
        "reset-credit",
        response.outcome,
      ),
      lastError: null,
    });
    return { outcome: response.outcome, account };
  } finally {
    client.stop();
  }
}

function consumeResetCredit(id, creditId) {
  return runAccountOperation(id, () => consumeResetCreditUnlocked(id, creditId));
}

async function consumeResetCredits(targets) {
  const uniqueTargets = [];
  const seen = new Set();

  for (const target of Array.isArray(targets) ? targets : []) {
    const accountId = String(target?.accountId || "");
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    uniqueTargets.push({
      accountId,
      creditId: target?.creditId ? String(target.creditId) : null,
    });
  }

  const results = [];
  for (const target of uniqueTargets) {
    try {
      const result = await consumeResetCredit(target.accountId, target.creditId);
      results.push({
        accountId: target.accountId,
        outcome: result.outcome,
        error: null,
      });
    } catch (error) {
      results.push({
        accountId: target.accountId,
        outcome: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { results, accounts: await loadAccounts() };
}

function renameAccount(id, label) {
  return runAccountOperation(id, async () => {
    const stored = await findAccount(id);
    return replaceAccount({
      ...stored,
      ...renameAccountLabel(label, stored.account?.email),
      updatedAt: new Date().toISOString(),
    });
  });
}

async function removeAccountUnlocked(id) {
  const stored = await findAccount(id);
  const paths = await ensureStore();
  const profileRoot = path.dirname(stored.codexHome);

  if (!isManagedProfilePath(paths.profiles, profileRoot)) {
    throw new Error("账号配置目录不在受管路径中");
  }

  await mutateAccounts((accounts) => ({
    accounts: accounts.filter((entry) => entry.id !== id),
    value: null,
  }));
  let cleanupDeferred = false;
  try {
    const cleanup = await removeProfileDirectory(paths.profiles, profileRoot);
    cleanupDeferred = cleanup.deferred;
  } catch (error) {
    cleanupDeferred = true;
    console.error("Profile cleanup was deferred", safeError(error));
  }
  return {
    removed: true,
    cleanupDeferred,
  };
}

function removeAccount(id) {
  return runAccountOperation(id, () => removeAccountUnlocked(id));
}

async function cleanupOrphanProfiles() {
  if (orphanCleanupRunning || storeRecoveryError) return;
  orphanCleanupRunning = true;

  try {
    let paths;
    let accounts;
    try {
      paths = await ensureStore();
      accounts = await loadAccounts();
    } catch (error) {
      storeRecoveryError = error;
      return;
    }
    const referencedProfiles = new Set(
      accounts
        .map((account) => path.dirname(account.codexHome))
        .filter((profileRoot) =>
          isManagedProfilePath(paths.profiles, profileRoot),
        )
        .map(profilePathKey),
    );
    for (const profileRoot of protectedProfileRoots) {
      referencedProfiles.add(profileRoot);
    }
    const entries = await fsp.readdir(paths.profiles, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const profileRoot = path.resolve(paths.profiles, entry.name);
      if (referencedProfiles.has(profilePathKey(profileRoot))) continue;

      try {
        await removeProfileDirectory(paths.profiles, profileRoot, {
          retries: 1,
          retryDelayMs: 250,
        });
      } catch (error) {
        console.error("Deferred profile cleanup failed", safeError(error));
      }
    }
  } finally {
    orphanCleanupRunning = false;
  }
}

function startOrphanCleanup() {
  void cleanupOrphanProfiles().catch((error) => {
    console.error("Initial profile cleanup failed", safeError(error));
  });
  orphanCleanupTimer = setInterval(() => {
    void cleanupOrphanProfiles().catch((error) => {
      console.error("Scheduled profile cleanup failed", safeError(error));
    });
  }, ORPHAN_CLEANUP_INTERVAL_MS);
  orphanCleanupTimer.unref?.();
}

function stopOrphanCleanup() {
  if (!orphanCleanupTimer) return;
  clearInterval(orphanCleanupTimer);
  orphanCleanupTimer = null;
}

function stopActiveAppServerClients() {
  for (const client of [...activeAppServerClients]) {
    client.stop();
  }
  activeAppServerClients.clear();
}

function launchCodexTerminal(codexHome) {
  const escapedHome = codexHome.replaceAll("'", "''");
  const command =
    `start \"\" powershell.exe -NoExit -NoLogo -Command ` +
    `\"$env:CODEX_HOME='${escapedHome}'; codex\"`;

  const child = spawn(
    process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    ["/d", "/s", "/c", command],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();
}

function safeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
  };
}

function registerIpcHandlers() {
  ipcMain.handle("accounts:list", async () => loadAccounts());
  ipcMain.handle("accounts:create", async (_event, label) =>
    createAccount(label),
  );
  ipcMain.handle("accounts:refresh", async (_event, id) =>
    refreshAccount(String(id)),
  );
  ipcMain.handle("accounts:refresh-all", async () => refreshAllAccounts());
  ipcMain.handle("accounts:login", async (_event, id) =>
    loginAccount(String(id)),
  );
  ipcMain.handle("accounts:rename", async (_event, id, label) =>
    renameAccount(String(id), label),
  );
  ipcMain.handle("accounts:remove", async (_event, id) =>
    removeAccount(String(id)),
  );
  ipcMain.handle("accounts:consume-reset", async (_event, id, creditId) => {
    const result = await consumeResetCredit(
      String(id),
      creditId ? String(creditId) : null,
    );
    return result;
  });
  ipcMain.handle("accounts:consume-reset-bulk", async (_event, targets) => {
    const result = await consumeResetCredits(targets);
    return result;
  });
  ipcMain.handle("accounts:launch", async (_event, id) => {
    const account = await findAccount(String(id));
    launchCodexTerminal(account.codexHome);
    return true;
  });
  ipcMain.handle("accounts:open-profile", async (_event, id) => {
    const account = await findAccount(String(id));
    return shell.openPath(account.codexHome);
  });
  ipcMain.handle("system:open-data", async () =>
    shell.openPath(getStorePaths().root),
  );
  ipcMain.handle("external:usage", async () =>
    shell.openExternal("https://chatgpt.com/codex/settings/usage"),
  );
  ipcMain.handle("external:codex", async () =>
    shell.openExternal("https://chatgpt.com/codex"),
  );
  ipcMain.handle("external:official-channel", async () =>
    shell.openExternal("https://t.me/renminpin"),
  );
  ipcMain.handle("external:vpn-sponsor", async () =>
    shell.openExternal("https://renminde.com"),
  );
  ipcMain.handle("system:info", async () => {
    let codexFound = true;
    let codexVersion = null;
    try {
      const result = execFileSync(
        process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
        ["/d", "/s", "/c", "codex --version"],
        { encoding: "utf8", windowsHide: true, timeout: 5_000 },
      );
      codexVersion = result.trim();
    } catch {
      codexFound = false;
    }
    return {
      appVersion: APP_VERSION,
      codexFound,
      codexVersion,
      dataDirectory: getStorePaths().root,
    };
  });

  ipcMain.on("renderer:error", (_event, error) => {
    console.error("Renderer error", safeError(error));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: "#f5f7f7",
    autoHideMenuBar: true,
    title: "Codex Account Manager",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.once("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") shell.openExternal(url);
    } catch {
      // Ignore malformed URLs from renderer content.
    }
    return { action: "deny" };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      await migrateLegacyStore();
      await ensureStore();
      storeRecoveryError = null;
    } catch (error) {
      storeRecoveryError = error;
      console.error("Account store requires recovery", safeError(error));
    }
    registerIpcHandlers();
    createWindow();
    startOrphanCleanup();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    stopOrphanCleanup();
    stopActiveAppServerClients();
  });
}
