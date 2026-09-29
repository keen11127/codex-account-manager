export type AccountStatus = "connected" | "signed-out" | "error";

export type PlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "prolite"
  | "team"
  | "self_serve_business_prolite"
  | "self_serve_business_usage_based"
  | "business"
  | "ent26"
  | "enterprise_cbp_automation"
  | "enterprise_cbp_usage_based"
  | "enterprise"
  | "edu"
  | "edu_plus"
  | "edu_pro"
  | "unknown";

export interface ChatGptAccount {
  type: "chatgpt";
  email: string | null;
  planType: PlanType;
}

export interface ApiKeyAccount {
  type: "apiKey";
}

export interface OtherAccount {
  type: "amazonBedrock" | "unknown";
}

export type CodexAccountIdentity =
  | ChatGptAccount
  | ApiKeyAccount
  | OtherAccount;

export interface RateLimitWindow {
  usedPercent: number;
  resetsAt: number | null;
  windowDurationMins: number | null;
}

export interface CreditsSnapshot {
  balance: string | null;
  hasCredits: boolean;
  unlimited: boolean;
}

export interface RateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  planType: PlanType | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  credits: CreditsSnapshot | null;
  individualLimit: {
    limit: string;
    used: string;
    remainingPercent: number;
    resetsAt: number;
  } | null;
  rateLimitReachedType: string | null;
  spendControlReached: boolean | null;
}

export type ResetCreditStatus =
  | "available"
  | "redeeming"
  | "redeemed"
  | "unknown";

export interface ResetCredit {
  id: string;
  status: ResetCreditStatus;
  resetType: string;
  title: string | null;
  description: string | null;
  grantedAt: number;
  expiresAt: number | null;
}

export interface ResetCreditsSummary {
  availableCount: number;
  credits: ResetCredit[] | null;
}

export interface RateLimitData {
  accountId: string | null;
  rateLimits: RateLimitSnapshot | null;
  rateLimitResetCredits: ResetCreditsSummary | null;
  quotaReadStatus?: {
    attemptedAt: string;
    attempts: number;
    missingQuotaTypes: Array<"primary" | "secondary">;
    cachedQuotaTypes: Array<"primary" | "secondary">;
  };
}

export type UsageEventType = "unexpected-official-reset";

export interface UsageEvent {
  id: string;
  type: UsageEventType;
  occurredAt: string;
  previousResetAt: number | null;
  nextResetAt: number | null;
  count: number;
}

export interface UsageStats {
  officialResetCount: number;
  officialPrimaryResetCount: number;
  officialSecondaryResetCount: number;
  resetCreditUseCount: number;
  lastObservedAt: string | null;
  lastOfficialResetAt: string | null;
  lastResetCreditUsedAt: string | null;
  events: UsageEvent[];
}

export interface ManagedAccount {
  id: string;
  label: string;
  labelSource?: "custom" | "email";
  codexHome: string;
  createdAt: string;
  updatedAt: string;
  status: AccountStatus;
  account: CodexAccountIdentity | null;
  rateLimitData: RateLimitData | null;
  usageStats?: UsageStats;
  lastError: string | null;
}

export type ResetOutcome =
  | "reset"
  | "nothingToReset"
  | "noCredit"
  | "alreadyRedeemed";

export interface ConsumeResetResult {
  outcome: ResetOutcome;
  account: ManagedAccount;
}

export interface BulkResetTarget {
  accountId: string;
  creditId: string | null;
}

export interface BulkResetItemResult {
  accountId: string;
  outcome: ResetOutcome | null;
  error: string | null;
}

export interface BulkConsumeResetResult {
  results: BulkResetItemResult[];
  accounts: ManagedAccount[];
}

export interface SystemInfo {
  appVersion: string;
  codexFound: boolean;
  codexVersion: string | null;
  dataDirectory: string;
}

export type AppView =
  | "accounts"
  | "workspace"
  | "prompts"
  | "providers"
  | "config"
  | "auth"
  | "extensions"
  | "sessions"
  | "backups"
  | "diagnostics"
  | "settings"
  | "about";

export type ManagedFileKind = "instructions" | "config" | "auth";

export interface ManagedTextFile {
  kind: ManagedFileKind;
  path: string;
  exists: boolean;
  content: string;
  updatedAt: string | null;
  backupPath?: string | null;
}

export interface ManagedSkill {
  id: string;
  name: string;
  enabled: boolean;
  canToggle: boolean;
  description: string | null;
  note: string;
  sourceUrl: string | null;
  updateStatus: "unchecked" | "current" | "available" | "unsupported" | "error";
  currentRef: string | null;
  latestRef: string | null;
  updateCheckedAt: string | null;
}

export interface ManagedMcpServer {
  name: string;
  transport: string;
  target: string | null;
  enabled?: boolean;
  note?: string;
}

export interface ExtensionInventory {
  skills: ManagedSkill[];
  mcpServers: ManagedMcpServer[];
  skillsDirectory: string;
  disabledSkillsDirectory: string;
  lastUpdateCheckAt?: string | null;
}

export interface ManagedSession {
  id: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
  projectPath: string | null;
  model: string | null;
  provider: string | null;
  syncStatus?: "current" | "outdated" | "unknown";
  syncDetail?: string;
}

export interface ManagedPrompt {
  id: string;
  title: string;
  category: string;
  description: string;
  content: string;
  source: "builtin" | "remote" | "custom";
  remoteRevision?: string | null;
  userEdited?: boolean;
  updatedAt: string;
}

export interface PromptLibrary {
  mode: "append" | "replace";
  activeIds: string[];
  prompts: ManagedPrompt[];
  categories: string[];
  lastSyncedAt: string | null;
  instructionsPath: string;
}

export interface ProviderProfileInput {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  wireApi: "responses" | "chat_completions";
  requiresOpenaiAuth: boolean;
  tomlConfig?: string;
  notes?: string;
  contextWindow?: number | null;
  modelMappings?: ProviderModelMapping[];
}

export interface ProviderModelMapping {
  model: string;
  displayName: string;
  contextWindow: number | null;
}

export interface ProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  wireApi: "responses" | "chat_completions";
  requiresOpenaiAuth: boolean;
  apiKeySet: boolean;
  apiKeyHint: string | null;
  tomlConfig: string;
  notes: string;
  contextWindow: number | null;
  modelMappings: ProviderModelMapping[];
  active: boolean;
  updatedAt: string;
}

export interface RoutingSettings {
  enabled: boolean;
  takeover: boolean;
  autoFailover: boolean;
  listenAddress: string;
  listenPort: number;
  providerIds: string[];
  maxRetries: number;
  firstByteTimeout: number;
  idleTimeout: number;
  requestTimeout: number;
  failureThreshold: number;
  successThreshold: number;
  errorRateThreshold: number;
  minimumRequests: number;
  recoverySeconds: number;
}

export interface ProviderInventory {
  activeId: string;
  official: {
    id: "official";
    name: string;
    active: boolean;
    authReady: boolean;
  };
  profiles: ProviderProfile[];
  routing: RoutingSettings;
}

export interface ProviderTestResult {
  ok: boolean;
  status: number | null;
  elapsedMs: number;
  models: string[];
  testedModel?: string | null;
  modelTest?: {
    ok: boolean;
    status: number | null;
    message: string;
  } | null;
  message: string;
}

export interface RouterProviderHealth {
  id: string;
  state: "closed" | "open" | "half_open";
  cooldownSeconds: number;
  lastStatus: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  failedRequests: number;
  errorRate: number;
}

export interface RouterStatus {
  running: boolean;
  takeoverActive: boolean;
  address: string | null;
  settings: RoutingSettings;
  runtime: {
    requestCount: number;
    failoverCount: number;
    inFlight: number;
    successCount: number;
    failureCount: number;
    uptimeSeconds: number;
    lastRequestAt: string | null;
    lastProviderId: string | null;
    lastError: string | null;
    providers: RouterProviderHealth[];
  };
}

export interface ManagedBackup {
  id: string;
  kind: ManagedFileKind;
  name: string;
  createdAt: string;
  sizeBytes: number;
}

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
  action: string | null;
}

export interface DiagnosticReport {
  checkedAt: string;
  codexHome: string;
  status: "ok" | "warning" | "error";
  checks: DiagnosticCheck[];
  configHealth?: ConfigHealthReport;
}

export interface ConfigHealthIssue {
  code: string;
  level: "warning" | "error";
  message: string;
  repairable: boolean;
}

export interface ConfigHealthReport {
  status: "healthy" | "warning" | "error";
  checkedAt: string;
  fingerprint: string;
  canRepair: boolean;
  issues: ConfigHealthIssue[];
  repairSummary: string[];
}

export interface WorkspaceImportPreview {
  sourceHome: string;
  skills: Array<{ id: string; exists: boolean }>;
  mcpServers: Array<ManagedMcpServer & { exists: boolean }>;
}

export interface ProviderImportResult {
  databasePath: string;
  imported: number;
  added: number;
  updated: number;
  merged: number;
  skipped: number;
  warnings: string[];
  inventory: ProviderInventory;
}

export interface SessionStatusResult {
  target: { provider: string | null; model: string | null };
  sessions: ManagedSession[];
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  publishedAt: string | null;
  notes: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  checksumUrl: string | null;
  releaseUrl: string;
}

export interface UpdateInstallResult {
  filePath: string;
  fileName: string;
  bytes: number;
  sha256: string;
  isInstaller: boolean;
  launched: boolean;
}

export interface RemoveAccountResult {
  removed: boolean;
  cleanupDeferred: boolean;
}

export interface CodexManagerBridge {
  isDesktop: boolean;
  listAccounts(): Promise<ManagedAccount[]>;
  createAccount(label: string): Promise<ManagedAccount>;
  refreshAccount(id: string): Promise<ManagedAccount>;
  refreshAll(): Promise<ManagedAccount[]>;
  loginAccount(id: string): Promise<ManagedAccount>;
  renameAccount(id: string, label: string): Promise<ManagedAccount>;
  removeAccount(id: string): Promise<RemoveAccountResult>;
  consumeResetCredit(
    id: string,
    creditId: string | null,
  ): Promise<ConsumeResetResult>;
  consumeResetCredits(
    targets: BulkResetTarget[],
  ): Promise<BulkConsumeResetResult>;
  launchCodex(id: string): Promise<boolean>;
  openProfile(id: string): Promise<string>;
  openDataDirectory(): Promise<string>;
  openUsage(): Promise<void>;
  openCodexWeb(): Promise<void>;
  openOfficialChannel(): Promise<void>;
  openVpnSponsor(): Promise<void>;
  openRepository(): Promise<void>;
  readManagedFile(id: string, kind: ManagedFileKind): Promise<ManagedTextFile>;
  writeManagedFile(
    id: string,
    kind: ManagedFileKind,
    content: string,
  ): Promise<ManagedTextFile>;
  listExtensions(id: string): Promise<ExtensionInventory>;
  toggleSkill(
    id: string,
    skillId: string,
    enabled: boolean,
  ): Promise<ExtensionInventory>;
  listSessions(id: string): Promise<ManagedSession[]>;
  deleteSession(id: string, sessionId: string): Promise<ManagedSession[]>;
  openSessionLocation(id: string, sessionId: string): Promise<boolean>;
  openToolPath(
    id: string,
    kind: ManagedFileKind | "home" | "skills" | "sessions",
  ): Promise<string>;
  listPrompts(id: string): Promise<PromptLibrary>;
  savePrompt(id: string, input: Partial<ManagedPrompt>): Promise<PromptLibrary>;
  deletePrompt(id: string, promptId: string): Promise<PromptLibrary>;
  togglePrompt(id: string, promptId: string, enabled: boolean): Promise<PromptLibrary>;
  setPromptMode(id: string, mode: PromptLibrary["mode"]): Promise<PromptLibrary>;
  syncPromptCatalog(id: string): Promise<{ library: PromptLibrary; added: number; updated: number; preserved: number }>;
  savePromptCategory(id: string, previousName: string, nextName: string): Promise<PromptLibrary>;
  deletePromptCategory(id: string, name: string): Promise<PromptLibrary>;
  importPrompt(id: string): Promise<PromptLibrary | null>;
  listProviders(id: string): Promise<ProviderInventory>;
  saveProvider(id: string, input: ProviderProfileInput): Promise<ProviderInventory>;
  duplicateProvider(id: string, providerId: string): Promise<ProviderInventory>;
  activateProvider(id: string, providerId: string): Promise<ProviderInventory>;
  deleteProvider(id: string, providerId: string): Promise<ProviderInventory>;
  testProvider(id: string, providerId: string, model?: string | null): Promise<ProviderTestResult>;
  importProviderDatabase(id: string): Promise<ProviderImportResult | null>;
  setContextWindow(id: string, enabled: boolean): Promise<{ enabled: boolean; file: ManagedTextFile }>;
  saveRouting(id: string, settings: RoutingSettings): Promise<ProviderInventory>;
  getRouterStatus(id: string): Promise<RouterStatus>;
  resetRouterHealth(id: string, providerId: string): Promise<RouterStatus>;
  toggleMcp(id: string, name: string, enabled: boolean): Promise<ExtensionInventory>;
  saveExtensionNote(id: string, kind: "skill" | "mcp", extensionId: string, note: string): Promise<ExtensionInventory>;
  checkSkillUpdates(id: string): Promise<ExtensionInventory>;
  updateSkill(id: string, skillId: string): Promise<ExtensionInventory>;
  installSkillZip(id: string): Promise<ExtensionInventory | null>;
  previewExistingWorkspace(id: string): Promise<WorkspaceImportPreview>;
  importExistingWorkspace(id: string, selection?: { skills: string[]; mcpServers: string[] }): Promise<{
    importedSkills: number;
    importedMcp: number;
    inventory: ExtensionInventory;
  }>;
  exportWorkspace(id: string): Promise<{ path: string; itemCount: number } | null>;
  deleteSessions(id: string, sessionIds: string[], permanent?: boolean): Promise<ManagedSession[]>;
  exportSessions(id: string, sessionIds: string[]): Promise<{ path: string; sessionCount: number } | null>;
  getSessionStatus(id: string): Promise<SessionStatusResult>;
  syncSessions(id: string, sessionIds: string[]): Promise<{ changed: number; skipped: number; errors: Array<{ id: string; message: string }>; status: SessionStatusResult }>;
  exportSessionsMarkdown(id: string, sessionIds: string[]): Promise<{ path: string; sessionCount: number } | null>;
  listBackups(id: string): Promise<ManagedBackup[]>;
  restoreBackup(id: string, backupId: string): Promise<{ restored: ManagedTextFile; backups: ManagedBackup[] }>;
  runDiagnostics(id: string): Promise<DiagnosticReport>;
  checkConfigHealth(id: string): Promise<ConfigHealthReport>;
  repairConfigHealth(id: string, fingerprint: string): Promise<{ changed: boolean; report: ConfigHealthReport; backupPath: string | null }>;
  checkForUpdate(): Promise<UpdateInfo>;
  installUpdate(): Promise<UpdateInstallResult>;
  openDownloads(): Promise<void>;
  getSystemInfo(): Promise<SystemInfo>;
  reportError(error: unknown): void;
}

declare global {
  interface Window {
    codexManager?: CodexManagerBridge;
  }
}
