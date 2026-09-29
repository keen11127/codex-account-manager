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
  | "instructions"
  | "config"
  | "extensions"
  | "sessions"
  | "about";

export type ManagedFileKind = "instructions" | "config";

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
}

export interface ManagedMcpServer {
  name: string;
  transport: string;
  target: string | null;
}

export interface ExtensionInventory {
  skills: ManagedSkill[];
  mcpServers: ManagedMcpServer[];
  skillsDirectory: string;
  disabledSkillsDirectory: string;
}

export interface ManagedSession {
  id: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
  projectPath: string | null;
  model: string | null;
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
