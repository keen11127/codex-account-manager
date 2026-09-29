import {
  Button,
  Checkbox,
  Field,
  Input,
  Spinner,
  Tab,
  TabList,
} from "@fluentui/react-components";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  ArrowSync20Regular,
  CheckmarkCircle20Filled,
  Clock20Regular,
  Delete20Regular,
  Dismiss20Regular,
  PersonAccounts20Regular,
  Search20Regular,
  TicketDiagonal20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { bridge } from "./bridge";
import { AccountDetail } from "./components/AccountDetail";
import { AccountOverview } from "./components/AccountOverview";
import { AccountTable } from "./components/AccountTable";
import { AboutPage } from "./components/AboutPage";
import { SideNavigation } from "./components/SideNavigation";
import { WorkspaceTools } from "./components/WorkspaceTools";
import type { AppView, ManagedAccount, ResetCredit } from "./types";
import {
  accountNeedsAttention,
  accountSearchText,
  canResetExhaustedWeeklyQuota,
  formatDateTime,
  formatElapsedSinceReset,
  formatExpiry,
  formatFullResetDateTime,
  formatUpdatedAt,
  getAccountEmail,
  getAvailableResetCredits,
  getAvailableResetCreditId,
  getMissingQuotaLabel,
  getResetCount,
  getResetCreditDisplay,
  getResetOutcomeText,
  hasExhaustedWeeklyQuota,
  hasLimitedQuota,
  isSuspectedBugAccount,
  remainingPercent,
} from "./utils";

type ToastIntent = "success" | "error" | "warning" | "info";
type AccountFilter = "all" | "attention" | "reset";

const viewTitles: Record<AppView, { title: string; subtitle: string }> = {
  accounts: { title: "账号中心", subtitle: "额度与登录状态" },
  workspace: { title: "工作区概览", subtitle: "当前 Codex 配置" },
  prompts: { title: "指令提示词", subtitle: "模板、分类与 AGENTS.md" },
  providers: { title: "供应商与路由", subtitle: "API、模型与故障转移" },
  config: { title: "TOML 配置", subtitle: "当前账号 live 配置" },
  auth: { title: "登录凭据", subtitle: "当前账号官方登录文件" },
  extensions: { title: "技能和 MCP", subtitle: "本地扩展管理" },
  sessions: { title: "会话管理", subtitle: "本地历史记录" },
  backups: { title: "备份与恢复", subtitle: "配置历史版本" },
  diagnostics: { title: "环境诊断", subtitle: "登录与本地目录检查" },
  settings: { title: "应用设置", subtitle: "刷新与本地数据" },
  about: { title: "关于", subtitle: "版本、更新与相关入口" },
};

interface LocalDialogProps {
  open: boolean;
  onOpenChange?: (
    event: Event | React.MouseEvent<HTMLDivElement> | null,
    data: { open: boolean },
  ) => void;
  children: ReactNode;
}

const DialogContext = createContext<{ titleId: string } | null>(null);
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function Dialog({ open, onOpenChange, children }: LocalDialogProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const titleId = useId();

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (open) return;
    const rememberFocus = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        !event.target.closest(".local-dialog-layer")
      ) {
        previousFocusRef.current = event.target;
      }
    };
    const rememberPointerTarget = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const trigger = event.target.closest<HTMLElement>(FOCUSABLE_SELECTOR);
      if (trigger) previousFocusRef.current = trigger;
    };
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      previousFocusRef.current = document.activeElement;
    }
    document.addEventListener("focusin", rememberFocus);
    document.addEventListener("pointerdown", rememberPointerTarget, true);
    return () => {
      document.removeEventListener("focusin", rememberFocus);
      document.removeEventListener("pointerdown", rememberPointerTarget, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (
      document.activeElement instanceof HTMLElement &&
      !layerRef.current?.contains(document.activeElement)
    ) {
      previousFocusRef.current = document.activeElement;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChangeRef.current?.(event, { open: false });
        return;
      }
      if (event.key !== "Tab") return;

      const layer = layerRef.current;
      if (!layer) return;
      const focusable = Array.from(
        layer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          !element.hasAttribute("disabled"),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        layer.querySelector<HTMLElement>('[role="dialog"]')?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !layer.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !layer.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusFrame = window.requestAnimationFrame(() => {
      const layer = layerRef.current;
      if (!layer || layer.contains(document.activeElement)) return;
      const first = layer.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first || layer.querySelector<HTMLElement>('[role="dialog"]'))?.focus();
    });

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;
  return (
    <DialogContext.Provider value={{ titleId }}>
      <div
        ref={layerRef}
        className="local-dialog-layer"
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            onOpenChangeRef.current?.(event, { open: false });
          }
        }}
      >
        {children}
      </div>
    </DialogContext.Provider>
  );
}

function DialogSurface({ children }: { children: ReactNode }) {
  const context = useContext(DialogContext);
  return (
    <section
      className="local-dialog-surface"
      role="dialog"
      aria-modal="true"
      aria-labelledby={context?.titleId}
      tabIndex={-1}
    >
      {children}
    </section>
  );
}

function DialogBody({ children }: { children: ReactNode }) {
  return <div className="local-dialog-body">{children}</div>;
}

function DialogTitle({ children }: { children: ReactNode }) {
  const context = useContext(DialogContext);
  return (
    <h2 className="local-dialog-title" id={context?.titleId}>
      {children}
    </h2>
  );
}

function DialogContent({ children }: { children: ReactNode }) {
  return <div className="local-dialog-content">{children}</div>;
}

function DialogActions({ children }: { children: ReactNode }) {
  return <footer className="local-dialog-actions">{children}</footer>;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "操作失败";
}

function upsertAccount(accounts: ManagedAccount[], next: ManagedAccount) {
  return accounts.map((account) =>
    account.id === next.id ? next : account,
  );
}

function updateWorkingSet(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  id: string,
  active: boolean,
) {
  setter((current) => {
    const next = new Set(current);
    if (active) next.add(id);
    else next.delete(id);
    return next;
  });
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>("accounts");
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [loggingInIds, setLoggingInIds] = useState<Set<string>>(new Set());
  const [consumingCreditId, setConsumingCreditId] = useState<string | null>(
    null,
  );
  const [bulkResetOpen, setBulkResetOpen] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkResetting, setBulkResetting] = useState(false);
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [now, setNow] = useState(Date.now());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    () => localStorage.getItem("codex-manager.auto-refresh") !== "off",
  );
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(() => {
    const parsed = Number(localStorage.getItem("codex-manager.refresh-minutes"));
    return [1, 2, 5, 10].includes(parsed) ? parsed : 1;
  });
  const refreshAllRequest = useRef<Promise<ManagedAccount[]> | null>(null);
  const accountsRef = useRef<ManagedAccount[]>([]);
  const loggingInIdsRef = useRef<Set<string>>(new Set());
  const autoRefreshRunning = useRef(false);
  const configHealthSeenRef = useRef<Map<string, string>>(new Map());

  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ManagedAccount | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ManagedAccount | null>(null);
  const [removingAccount, setRemovingAccount] = useState(false);
  const [consumeTarget, setConsumeTarget] = useState<{
    account: ManagedAccount;
    credit: ResetCredit;
  } | null>(null);
  const [notice, setNotice] = useState<{
    id: number;
    title: string;
    body?: string;
    intent: ToastIntent;
  } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const notify = useCallback(
    (title: string, body?: string, intent: ToastIntent = "info") => {
      if (noticeTimer.current !== null) {
        window.clearTimeout(noticeTimer.current);
      }
      setNotice({ id: Date.now(), title, body, intent });
      noticeTimer.current = window.setTimeout(() => {
        setNotice(null);
        noticeTimer.current = null;
      }, 5_000);
    },
    [],
  );

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) {
        window.clearTimeout(noticeTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "codex-manager.auto-refresh",
      autoRefreshEnabled ? "on" : "off",
    );
  }, [autoRefreshEnabled]);

  useEffect(() => {
    localStorage.setItem(
      "codex-manager.refresh-minutes",
      String(autoRefreshMinutes),
    );
  }, [autoRefreshMinutes]);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    loggingInIdsRef.current = loggingInIds;
  }, [loggingInIds]);

  useEffect(() => {
    let alive = true;

    async function loadAccounts() {
      try {
        const loadedAccounts = await bridge.listAccounts();
        if (!alive) return;
        setAccounts(loadedAccounts);
        setLoadError(null);
        setSelectedId((current) => current || loadedAccounts[0]?.id || null);
        setLoading(false);
      } catch (error) {
        if (alive) {
          const message = errorMessage(error);
          setLoadError(message);
          notify("账号数据需要恢复", message, "error");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadAccounts();
    return () => {
      alive = false;
    };
  }, [notify]);

  const retryLoadAccounts = async () => {
    setLoading(true);
    try {
      const loadedAccounts = await bridge.listAccounts();
      setAccounts(loadedAccounts);
      setSelectedId((current) =>
        current && loadedAccounts.some((account) => account.id === current)
          ? current
          : loadedAccounts[0]?.id || null,
      );
      setLoadError(null);
      notify("账号数据已恢复", `${loadedAccounts.length} 个账号已读取`, "success");
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      notify("恢复读取仍未完成", message, "error");
    } finally {
      setLoading(false);
    }
  };

  const openDataDirectory = async () => {
    try {
      const result = await bridge.openDataDirectory();
      if (result) notify("打开数据目录失败", result, "error");
    } catch (error) {
      notify("打开数据目录失败", errorMessage(error), "error");
    }
  };

  const attentionAccounts = useMemo(
    () => accounts.filter(accountNeedsAttention),
    [accounts],
  );
  const resetAccounts = useMemo(
    () => accounts.filter((account) => (getResetCount(account, now) || 0) > 0),
    [accounts, now],
  );
  const limitedAccounts = useMemo(
    () => accounts.filter(hasLimitedQuota),
    [accounts],
  );
  const weeklyExhaustedAccounts = useMemo(
    () => accounts.filter(hasExhaustedWeeklyQuota),
    [accounts],
  );
  const bulkRecommendedAccounts = useMemo(
    () =>
      accounts.filter((account) =>
        canResetExhaustedWeeklyQuota(account, now),
      ),
    [accounts, now],
  );
  const bulkSelectedAccounts = useMemo(
    () =>
      resetAccounts.filter((account) =>
        bulkSelectedIds.has(account.id),
      ),
    [bulkSelectedIds, resetAccounts],
  );

  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return accounts.filter((account) => {
      if (accountFilter === "attention" && !accountNeedsAttention(account)) {
        return false;
      }
      if (
        accountFilter === "reset" &&
        (getResetCount(account, now) || 0) <= 0
      ) {
        return false;
      }
      return !normalized || accountSearchText(account).includes(normalized);
    });
  }, [accountFilter, accounts, now, query]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId) || null,
    [accounts, selectedId],
  );

  const openAccountDetail = useCallback((id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDetailOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailOpen]);

  useEffect(() => {
    if (!selectedAccount || activeView !== "accounts") {
      setDetailOpen(false);
    }
  }, [activeView, selectedAccount]);

  useEffect(() => {
    if (
      (query.trim() || accountFilter !== "all") &&
      filteredAccounts.length > 0 &&
      !filteredAccounts.some((account) => account.id === selectedId)
    ) {
      setSelectedId(filteredAccounts[0].id);
    }
  }, [accountFilter, filteredAccounts, query, selectedId]);

  const connectedAccounts = accounts.filter(
    (account) => account.status === "connected",
  );
  const totalResetCredits = accounts.reduce(
    (sum, account) => sum + (getResetCount(account, now) || 0),
    0,
  );
  const lastOfficialResetAt = accounts
    .map((account) => account.usageStats?.lastOfficialResetAt || null)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const consumeDisplay = consumeTarget
    ? getResetCreditDisplay(consumeTarget.credit)
    : null;

  const refreshAll = useCallback(async () => {
    if (refreshingIds.size > 0) return;
    const request = refreshAllRequest.current || bridge.refreshAll();
    refreshAllRequest.current = request;
    setRefreshingAll(true);
    try {
      const nextAccounts = await request;
      setAccounts(nextAccounts);
      const failedAccounts = nextAccounts.filter(
        (account) => account.status === "error",
      );
      const incompleteAccounts = nextAccounts.filter(
        (account) =>
          account.status === "connected" &&
          Boolean(getMissingQuotaLabel(account)) &&
          !isSuspectedBugAccount(account),
      );
      const details: string[] = [];
      if (failedAccounts.length > 0) {
        details.push(`${failedAccounts.length} 个失败`);
      }
      if (incompleteAccounts.length > 0) {
        details.push(`${incompleteAccounts.length} 个额度数据不完整`);
      }
      notify(
        failedAccounts.length > 0
          ? "刷新完成，部分账号失败"
          : incompleteAccounts.length > 0
            ? "刷新完成，部分账号需重新登录"
            : "全部刷新成功",
        details.length > 0
          ? details.join("，")
          : `${nextAccounts.length} 个账号已更新`,
        failedAccounts.length > 0
          ? "error"
          : incompleteAccounts.length > 0
            ? "warning"
            : "success",
      );
    } catch (error) {
      notify("刷新失败", errorMessage(error), "error");
    } finally {
      if (refreshAllRequest.current === request) {
        refreshAllRequest.current = null;
      }
      setRefreshingAll(false);
    }
  }, [notify, refreshingIds]);

  const runAutomaticRefreshCycle = useCallback(async () => {
    if (autoRefreshRunning.current || refreshAllRequest.current) return;
    const targets = accountsRef.current.filter(
      (account) =>
        account.account !== null && !loggingInIdsRef.current.has(account.id),
    );
    if (targets.length === 0) return;

    autoRefreshRunning.current = true;
    try {
      for (const target of targets) {
        if (refreshAllRequest.current) break;
        updateWorkingSet(setRefreshingIds, target.id, true);
        try {
          const refreshed = await bridge.refreshAccount(target.id);
          setAccounts((current) => upsertAccount(current, refreshed));
        } catch {
          const latest = await bridge.listAccounts();
          setAccounts(latest);
        } finally {
          updateWorkingSet(setRefreshingIds, target.id, false);
        }
      }
    } finally {
      autoRefreshRunning.current = false;
    }
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled || loading || accounts.length === 0) return;
    const interval = window.setInterval(
      () => void runAutomaticRefreshCycle(),
      autoRefreshMinutes * 60_000,
    );
    return () => window.clearInterval(interval);
  }, [
    accounts.length,
    autoRefreshEnabled,
    autoRefreshMinutes,
    loading,
    runAutomaticRefreshCycle,
  ]);

  useEffect(() => {
    if (!selectedId || loading) return;
    let alive = true;
    const check = async () => {
      try {
        const report = await bridge.checkConfigHealth(selectedId);
        if (!alive || report.status === "healthy") return;
        const last = configHealthSeenRef.current.get(selectedId);
        if (last === report.fingerprint) return;
        configHealthSeenRef.current.set(selectedId, report.fingerprint);
        notify(
          report.canRepair ? "检测到可修复的配置问题" : "检测到配置问题",
          report.issues[0]?.message || "请前往环境诊断查看详情",
          report.status === "error" ? "error" : "warning",
        );
      } catch {
        // Background health checks stay quiet; manual diagnostics show errors.
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [loading, notify, selectedId]);

  const login = async (id: string) => {
    updateWorkingSet(setLoggingInIds, id, true);
    try {
      const account = await bridge.loginAccount(id);
      setAccounts((current) => upsertAccount(current, account));
      setSelectedId(account.id);
      notify("登录完成", account.label, "success");
    } catch (error) {
      notify("登录未完成", errorMessage(error), "error");
      const latest = await bridge.listAccounts();
      setAccounts(latest);
    } finally {
      updateWorkingSet(setLoggingInIds, id, false);
    }
  };

  const addAccount = async () => {
    setAdding(true);
    try {
      const account = await bridge.createAccount(newLabel);
      setAccounts((current) => [account, ...current]);
      setSelectedId(account.id);
      setAddOpen(false);
      setNewLabel("");
      await login(account.id);
    } catch (error) {
      notify("添加失败", errorMessage(error), "error");
    } finally {
      setAdding(false);
    }
  };

  const renameAccount = async () => {
    if (!renameTarget) return;
    try {
      const account = await bridge.renameAccount(renameTarget.id, renameValue);
      setAccounts((current) => upsertAccount(current, account));
      setRenameTarget(null);
      notify("名称已更新", account.label, "success");
    } catch (error) {
      notify("重命名失败", errorMessage(error), "error");
    }
  };

  const removeAccount = async () => {
    if (!deleteTarget || removingAccount) return;
    setRemovingAccount(true);
    try {
      const result = await bridge.removeAccount(deleteTarget.id);
      const next = accounts.filter((account) => account.id !== deleteTarget.id);
      setAccounts(next);
      if (selectedId === deleteTarget.id) setSelectedId(next[0]?.id || null);
      setDeleteTarget(null);
      notify(
        "账号已移除",
        result.cleanupDeferred
          ? "占用中的本地文件将在释放后自动清理"
          : undefined,
        result.cleanupDeferred ? "warning" : "success",
      );
    } catch (error) {
      notify("移除失败", errorMessage(error), "error");
    } finally {
      setRemovingAccount(false);
    }
  };

  const consumeResetCredit = async () => {
    if (!consumeTarget) return;
    setConsumingCreditId(consumeTarget.credit.id);
    try {
      const result = await bridge.consumeResetCredit(
        consumeTarget.account.id,
        consumeTarget.credit.id,
      );
      setAccounts((current) => upsertAccount(current, result.account));
      notify(
        getResetOutcomeText(result.outcome),
        result.account.label,
        result.outcome === "reset" ? "success" : "warning",
      );
      setConsumeTarget(null);
    } catch (error) {
      notify("重置失败", errorMessage(error), "error");
    } finally {
      setConsumingCreditId(null);
    }
  };

  const openBulkReset = () => {
    setBulkSelectedIds(
      new Set(bulkRecommendedAccounts.map((account) => account.id)),
    );
    setBulkConfirmOpen(false);
    setBulkResetOpen(true);
  };

  const closeBulkReset = () => {
    if (bulkResetting) return;
    setBulkResetOpen(false);
    setBulkConfirmOpen(false);
    setBulkSelectedIds(new Set());
  };

  const requestBulkResetConfirmation = () => {
    if (bulkSelectedAccounts.length === 0) return;
    setBulkResetOpen(false);
    setBulkConfirmOpen(true);
  };

  const consumeBulkResetCredits = async () => {
    const targets = resetAccounts
      .filter((account) => bulkSelectedIds.has(account.id))
      .map((account) => ({
        accountId: account.id,
        creditId: getAvailableResetCreditId(account, now),
      }));
    if (targets.length === 0) return;

    setBulkResetting(true);
    try {
      const result = await bridge.consumeResetCredits(targets);
      setAccounts(result.accounts);

      const succeeded = result.results.filter(
        (item) => item.outcome === "reset",
      ).length;
      const failed = result.results.length - succeeded;
      notify(
        "批量重置已完成",
        failed > 0
          ? `${succeeded} 个成功，${failed} 个需要检查`
          : `${succeeded} 个账号的额度已重置`,
        failed > 0 ? "warning" : "success",
      );
      closeBulkReset();
    } catch (error) {
      notify("批量重置失败", errorMessage(error), "error");
    } finally {
      setBulkResetting(false);
    }
  };

  const launchCodex = async (id: string) => {
    try {
      await bridge.launchCodex(id);
    } catch (error) {
      notify("启动失败", errorMessage(error), "error");
    }
  };

  const openProfile = async (id: string) => {
    try {
      const result = await bridge.openProfile(id);
      if (result) notify("打开目录失败", result, "error");
    } catch (error) {
      notify("打开目录失败", errorMessage(error), "error");
    }
  };

  return (
    <div className="app-shell">
      {notice ? (
        <div
          className={`local-notice is-${notice.intent}`}
          role="status"
          aria-live="polite"
          key={notice.id}
        >
          <span className="local-notice__marker" aria-hidden="true" />
          <div className="local-notice__copy">
            <strong>{notice.title}</strong>
            {notice.body ? <span>{notice.body}</span> : null}
          </div>
          <button
            className="local-notice__close"
            type="button"
            aria-label="关闭通知"
            onClick={() => setNotice(null)}
          >
            <Dismiss20Regular />
          </button>
        </div>
      ) : null}

      <SideNavigation
        activeView={activeView}
        onChange={(view) => {
          setDetailOpen(false);
          setActiveView(view);
        }}
        preview={!bridge.isDesktop}
      />

      <header className="topbar">
        <div className="topbar-view" aria-live="polite">
          <strong>{viewTitles[activeView].title}</strong>
          <span>{viewTitles[activeView].subtitle}</span>
        </div>

        <div className="topbar-actions">
          {activeView === "accounts" ? (
            <>
              <Button
                className="topbar-icon-button"
                icon={refreshingAll ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />}
                aria-label={refreshingAll ? "正在刷新全部账号" : "刷新全部账号"}
                title={refreshingAll ? "正在刷新全部账号" : "刷新全部账号"}
                disabled={refreshingAll || refreshingIds.size > 0 || accounts.length === 0}
                onClick={() => void refreshAll()}
              />
              <Button
                icon={<Add20Regular />}
                aria-label="添加账号"
                onClick={() => setAddOpen(true)}
              >
                添加账号
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <main className="app-main">
        {activeView === "accounts" ? (
          <>
          <section className="summary-band" aria-label="账号摘要">
          <div className="summary-item">
            <span className="summary-item__icon summary-item__icon--teal">
              <PersonAccounts20Regular />
            </span>
            <div>
              <span>账号总数</span>
              <strong>{accounts.length}</strong>
              <small>{accounts.length - connectedAccounts.length} 个未在线</small>
            </div>
          </div>
          <div className="summary-item">
            <span className="summary-item__icon summary-item__icon--green">
              <CheckmarkCircle20Filled />
            </span>
            <div>
              <span>在线账号</span>
              <strong>{connectedAccounts.length}</strong>
              <small>登录文件已保留</small>
            </div>
          </div>
          <div className="summary-item">
            <span className="summary-item__icon summary-item__icon--red">
              <Warning20Regular />
            </span>
            <div>
              <span>限额账号</span>
              <strong>{limitedAccounts.length}</strong>
              <small>额度剩余不高于 15%</small>
            </div>
          </div>
          <div className="summary-item">
            <span className="summary-item__icon summary-item__icon--amber">
              <Clock20Regular />
            </span>
            <div>
              <span>周额度耗尽</span>
              <strong>{weeklyExhaustedAccounts.length}</strong>
              <small>{bulkRecommendedAccounts.length} 个建议立即重置</small>
            </div>
          </div>
          <div className="summary-item">
            <span className="summary-item__icon summary-item__icon--renew">
              <TicketDiagonal20Regular />
            </span>
            <div>
              <span>可用重置卡</span>
              <strong>{totalResetCredits}</strong>
              <small>{resetAccounts.length} 个账号持有</small>
            </div>
          </div>
          <div className="summary-item">
            <span className="summary-item__icon summary-item__icon--blue">
              <ArrowSync20Regular />
            </span>
            <div>
              <span>最近异常重置</span>
              <strong className="summary-item__time">
                {lastOfficialResetAt
                  ? formatElapsedSinceReset(lastOfficialResetAt, now)
                  : "--"}
              </strong>
              <small>
                {lastOfficialResetAt
                  ? formatFullResetDateTime(lastOfficialResetAt)
                  : "尚未检测到提前恢复"}
              </small>
            </div>
          </div>
          </section>

          <section className="workspace">
          <div className="account-surface" id="accounts-view">
            <div className="surface-toolbar">
              <div className="surface-toolbar__title">
                <h1>账号概览</h1>
                <span>
                  {connectedAccounts.length} 个在线，{attentionAccounts.length} 个待处理
                </span>
              </div>
            </div>

            <div className="account-filterbar">
              <TabList
                size="small"
                selectedValue={accountFilter}
                onTabSelect={(_event, data) =>
                  setAccountFilter(data.value as AccountFilter)
                }
              >
                <Tab value="all">全部 {accounts.length}</Tab>
                <Tab value="attention">需处理 {attentionAccounts.length}</Tab>
                <Tab value="reset">有重置卡 {resetAccounts.length}</Tab>
              </TabList>
              <div className="account-filterbar__actions">
                <span>{filteredAccounts.length} 个结果</span>
                <Input
                  className="account-search"
                  contentBefore={<Search20Regular />}
                  placeholder="搜索账号"
                  aria-label="搜索账号"
                  value={query}
                  onChange={(_event, data) => setQuery(data.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="surface-state">
                <Spinner label="正在加载账号" />
              </div>
            ) : loadError ? (
              <div className="surface-state surface-state--recovery" role="alert">
                <Warning20Regular />
                <strong>账号数据需要恢复</strong>
                <span>{loadError}</span>
                <div>
                  <Button appearance="primary" onClick={() => void retryLoadAccounts()}>
                    重试读取
                  </Button>
                  <Button appearance="secondary" onClick={() => void openDataDirectory()}>
                    打开数据目录
                  </Button>
                </div>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="surface-state surface-state--empty">
                <PersonAccounts20Regular />
                <strong>{accounts.length === 0 ? "还没有账号" : "没有匹配结果"}</strong>
                {accounts.length === 0 ? (
                  <Button
                    appearance="primary"
                    icon={<Add20Regular />}
                    aria-label="添加账号"
                    onClick={() => setAddOpen(true)}
                  >
                    添加账号
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <AccountTable
                  accounts={filteredAccounts}
                  selectedId={selectedId}
                  now={now}
                  onSelect={openAccountDetail}
                  onLogin={login}
                  onLaunch={launchCodex}
                  onRename={(account) => {
                    setRenameTarget(account);
                    setRenameValue(account.label);
                  }}
                  onDelete={setDeleteTarget}
                  onOpenProfile={openProfile}
                />
                <AccountOverview
                  accounts={accounts}
                  now={now}
                  onSelect={openAccountDetail}
                  availableResetCount={resetAccounts.length}
                  onBulkReset={openBulkReset}
                />
              </>
            )}
          </div>

          </section>
          {detailOpen && selectedAccount ? (
            <div
              className="account-detail-layer"
              role="presentation"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setDetailOpen(false);
              }}
            >
              <AccountDetail
                account={selectedAccount}
                now={now}
                loggingIn={loggingInIds.has(selectedAccount.id)}
                consumingCreditId={consumingCreditId}
                onClose={() => setDetailOpen(false)}
                onLogin={login}
                onLaunch={launchCodex}
                onOpenProfile={openProfile}
                onOpenUsage={() => bridge.openUsage()}
                onOpenCodexWeb={() => bridge.openCodexWeb()}
                onConsume={(account, credit) =>
                  setConsumeTarget({ account, credit })
                }
              />
            </div>
          ) : null}
          </>
        ) : (
          <section className="utility-workspace">
            {activeView === "about" ? (
              <AboutPage onNotify={notify} />
            ) : (
              <WorkspaceTools
                view={activeView}
                accounts={accounts}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onNotify={notify}
                onNavigate={setActiveView}
                onLogin={(id) => void login(id)}
                autoRefreshEnabled={autoRefreshEnabled}
                autoRefreshMinutes={autoRefreshMinutes}
                onAutoRefreshEnabled={setAutoRefreshEnabled}
                onAutoRefreshMinutes={setAutoRefreshMinutes}
              />
            )}
          </section>
        )}
      </main>

      <Dialog open={addOpen} onOpenChange={(_event, data) => setAddOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>添加 Codex 账号</DialogTitle>
            <DialogContent>
              <Field
                label="账号名称（可选）"
                hint="留空时，登录后自动使用邮箱 @ 前的名称"
              >
                <Input
                  autoFocus
                  value={newLabel}
                  placeholder="例如：主力开发"
                  onChange={(_event, data) => setNewLabel(data.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !adding) addAccount();
                  }}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setAddOpen(false)}>
                取消
              </Button>
              <Button
                appearance="primary"
                icon={adding ? <Spinner size="tiny" /> : <Add20Regular />}
                aria-label="添加并登录"
                disabled={adding}
                onClick={addAccount}
              >
                添加并登录
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(_event, data) => {
          if (!data.open) setRenameTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>重命名账号</DialogTitle>
            <DialogContent>
              <Field label="账号名称">
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(_event, data) => setRenameValue(data.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") renameAccount();
                  }}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRenameTarget(null)}>
                取消
              </Button>
              <Button appearance="primary" onClick={renameAccount}>
                保存
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(_event, data) => {
          if (!data.open && !removingAccount) setDeleteTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>移除账号</DialogTitle>
            <DialogContent>
              将移除“{deleteTarget?.label}”及其本地 Codex 登录文件。
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={removingAccount}
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </Button>
              <Button
                className="danger-button"
                appearance="primary"
                icon={removingAccount ? <Spinner size="tiny" /> : <Delete20Regular />}
                aria-label="确认移除账号"
                disabled={removingAccount}
                onClick={removeAccount}
              >
                {removingAccount ? "正在移除" : "移除"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={Boolean(consumeTarget)}
        onOpenChange={(_event, data) => {
          if (!data.open && !consumingCreditId) setConsumeTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>使用重置卡</DialogTitle>
            <DialogContent>
              <p className="dialog-copy">
                将消耗 1 张重置卡，为“{consumeTarget?.account.label}”恢复对应的
                Codex 额度。
              </p>
              {consumeTarget && consumeDisplay ? (
                <div className="dialog-facts">
                  <div>
                    <span>重置类型</span>
                    <strong>{consumeDisplay.title}</strong>
                  </div>
                  <div>
                    <span>作用范围</span>
                    <strong>{consumeDisplay.scope}</strong>
                  </div>
                  <div>
                    <span>剩余有效期</span>
                    <strong>
                      {consumeTarget.credit.expiresAt
                        ? formatExpiry(consumeTarget.credit.expiresAt, now)
                        : "无固定到期时间"}
                    </strong>
                  </div>
                  <div>
                    <span>到期时间</span>
                    <strong>
                      {formatDateTime(consumeTarget.credit.expiresAt)}
                    </strong>
                  </div>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={Boolean(consumingCreditId)}
                onClick={() => setConsumeTarget(null)}
              >
                取消
              </Button>
              <Button
                appearance="primary"
                icon={
                  consumingCreditId ? (
                    <Spinner size="tiny" />
                  ) : (
                    <TicketDiagonal20Regular />
                  )
                }
                aria-label="确认使用重置卡"
                disabled={Boolean(consumingCreditId)}
                onClick={consumeResetCredit}
              >
                确认使用
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={bulkResetOpen}
        onOpenChange={(_event, data) => {
          if (!data.open) closeBulkReset();
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>批量使用重置卡</DialogTitle>
            <DialogContent>
              <p className="dialog-copy">
                这里仅列出持有真实可用重置卡的账号。周额度已耗尽的账号会优先勾选，也可以手动选择其他账号。
              </p>
              <div className="bulk-reset-selection-bar">
                <span aria-live="polite">
                  已选择 {bulkSelectedAccounts.length} / {resetAccounts.length} 个账号
                </span>
                <div>
                  <Button
                    appearance="subtle"
                    size="small"
                    disabled={bulkResetting || resetAccounts.length === 0}
                    onClick={() =>
                      setBulkSelectedIds(
                        new Set(resetAccounts.map((account) => account.id)),
                      )
                    }
                  >
                    全选
                  </Button>
                  <Button
                    appearance="subtle"
                    size="small"
                    disabled={bulkResetting || bulkSelectedAccounts.length === 0}
                    onClick={() => setBulkSelectedIds(new Set())}
                  >
                    清空
                  </Button>
                </div>
              </div>
              <div className="bulk-reset-list">
                {resetAccounts.map((account) => {
                  const weeklyRemaining = remainingPercent(
                    account.rateLimitData?.rateLimits?.secondary,
                  );
                  const recommended = canResetExhaustedWeeklyQuota(account, now);
                  const earliestExpiringCredit = getAvailableResetCredits(
                    account,
                    now,
                  )
                    .filter((credit) => Boolean(credit.expiresAt))
                    .sort(
                      (first, second) =>
                        (first.expiresAt || Number.POSITIVE_INFINITY) -
                        (second.expiresAt || Number.POSITIVE_INFINITY),
                    )[0];
                  return (
                    <label className="bulk-reset-row" key={account.id}>
                      <Checkbox
                        checked={bulkSelectedIds.has(account.id)}
                        disabled={bulkResetting}
                        onChange={(_event, data) => {
                          setBulkSelectedIds((current) => {
                            const next = new Set(current);
                            if (data.checked) next.add(account.id);
                            else next.delete(account.id);
                            return next;
                          });
                        }}
                      />
                      <span className="bulk-reset-row__identity">
                        <strong>{account.label}</strong>
                        <span>{getAccountEmail(account)}</span>
                      </span>
                      <span className="bulk-reset-row__quota">
                        <strong>
                          {weeklyRemaining === null
                            ? "周额度未读取"
                            : `周额度 ${weeklyRemaining}%`}
                        </strong>
                        <span>{getResetCount(account, now) || 0} 张可用</span>
                        <span className="bulk-reset-row__expiry">
                          {earliestExpiringCredit
                            ? formatExpiry(earliestExpiringCredit.expiresAt, now)
                            : "无固定到期时间"}
                        </span>
                        {earliestExpiringCredit?.expiresAt ? (
                          <time>
                            {formatDateTime(earliestExpiringCredit.expiresAt)}
                          </time>
                        ) : null}
                        {recommended ? <b>建议重置</b> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={bulkResetting}
                onClick={closeBulkReset}
              >
                取消
              </Button>
              <Button
                appearance="primary"
                icon={
                  <ArrowSync20Regular
                    className={bulkResetting ? "is-spinning" : undefined}
                  />
                }
                disabled={bulkResetting || bulkSelectedAccounts.length === 0}
                aria-label={`下一步，确认重置 ${bulkSelectedAccounts.length} 个账号`}
                onClick={requestBulkResetConfirmation}
              >
                下一步
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={bulkConfirmOpen}
        onOpenChange={(_event, data) => {
          if (!data.open) closeBulkReset();
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>确认批量使用重置卡</DialogTitle>
            <DialogContent>
              <div className="bulk-confirm-warning" role="alert">
                <Warning20Regular aria-hidden="true" />
                <div>
                  <strong>
                    将立即消耗 {bulkSelectedAccounts.length} 张重置卡
                  </strong>
                  <span>提交后不能撤销，请核对以下账号。</span>
                </div>
              </div>
              <div className="bulk-confirm-list" aria-label="待重置账号">
                {bulkSelectedAccounts.map((account) => (
                  <div className="bulk-confirm-row" key={account.id}>
                    <span>
                      <strong>{account.label}</strong>
                      <small>{getAccountEmail(account)}</small>
                    </span>
                    <b>1 张</b>
                  </div>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={bulkResetting}
                onClick={() => {
                  setBulkConfirmOpen(false);
                  setBulkResetOpen(true);
                }}
              >
                返回上一步
              </Button>
              <Button
                appearance="primary"
                icon={
                  bulkResetting ? (
                    <Spinner size="tiny" />
                  ) : (
                    <TicketDiagonal20Regular />
                  )
                }
                disabled={bulkResetting || bulkSelectedAccounts.length === 0}
                aria-label={`确认使用 ${bulkSelectedAccounts.length} 张重置卡`}
                onClick={consumeBulkResetCredits}
              >
                {bulkResetting
                  ? "正在处理"
                  : `确认使用 ${bulkSelectedAccounts.length} 张`}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
