import {
  Badge,
  Button,
} from "@fluentui/react-components";
import {
  ArrowSync20Regular,
  Delete20Regular,
  Edit20Regular,
  FolderOpen20Regular,
  MoreHorizontal20Regular,
  Open20Regular,
  Play20Regular,
} from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import type { ManagedAccount } from "../types";
import {
  getAccountEmail,
  getAccountPlan,
  getPlanLabel,
  getResetCount,
  isSuspectedBugAccount,
  remainingPercent,
} from "../utils";
import { QuotaBar } from "./QuotaBar";

interface AccountTableProps {
  accounts: ManagedAccount[];
  selectedId: string | null;
  now: number;
  onSelect(id: string): void;
  onLogin(id: string): void;
  onLaunch(id: string): void;
  onRename(account: ManagedAccount): void;
  onDelete(account: ManagedAccount): void;
  onOpenProfile(id: string): void;
}

function StatusBadge({ account }: { account: ManagedAccount }) {
  if (isSuspectedBugAccount(account)) {
    return (
      <Badge appearance="tint" color="warning" size="small">
        疑似 BUG号
      </Badge>
    );
  }
  if (account.status === "connected") {
    return (
      <Badge appearance="tint" color="success" size="small">
        已连接
      </Badge>
    );
  }
  if (account.status === "error") {
    return (
      <Badge appearance="tint" color="danger" size="small">
        异常
      </Badge>
    );
  }
  return (
    <Badge appearance="tint" color="subtle" size="small">
      未登录
    </Badge>
  );
}

export function AccountTable({
  accounts,
  selectedId,
  now,
  onSelect,
  onLogin,
  onLaunch,
  onRename,
  onDelete,
  onOpenProfile,
}: AccountTableProps) {
  const [menuState, setMenuState] = useState<{
    accountId: string;
    top: number;
    left: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuState) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest(`[data-account-menu-trigger="${menuState.accountId}"]`)
      ) {
        return;
      }
      setMenuState(null);
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuState(null);
    };
    const closeOnViewportChange = () => setMenuState(null);

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [menuState]);

  const runMenuAction = (action: () => void) => {
    setMenuState(null);
    action();
  };

  return (
    <div className="account-grid" role="grid" aria-label="Codex 账号列表">
      <div className="account-grid__header" role="row">
        <div role="columnheader">账号</div>
        <div role="columnheader">状态</div>
        <div role="columnheader">套餐</div>
        <div role="columnheader">5 小时</div>
        <div role="columnheader">每周</div>
        <div role="columnheader">重置卡</div>
        <div role="columnheader" aria-label="操作" />
      </div>

      <div className="account-grid__body">
        {accounts.map((account) => {
          const limits = account.rateLimitData?.rateLimits;
          const primary = limits?.primary;
          const secondary = limits?.secondary;
          const resetCount = getResetCount(account, now);
          const connected = account.status === "connected";
          const hasSnapshot = Boolean(account.account);
          const cachedQuotaTypes =
            account.rateLimitData?.quotaReadStatus?.cachedQuotaTypes || [];

          return (
            <div
              className={`account-grid__row ${
                selectedId === account.id ? "is-selected" : ""
              }`}
              role="row"
              aria-selected={selectedId === account.id}
              tabIndex={0}
              key={account.id}
              onClick={() => onSelect(account.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(account.id);
                }
              }}
            >
              <div className="account-identity" role="gridcell">
                <div className="account-avatar" aria-hidden="true">
                  {account.label.slice(0, 1).toLocaleUpperCase("zh-CN")}
                </div>
                <div className="account-identity__copy">
                  <div className="account-identity__titleline">
                    <span className="account-identity__label">{account.label}</span>
                  </div>
                  <span className="account-identity__email">
                    {getAccountEmail(account)}
                  </span>
                </div>
              </div>

              <div className="status-cell" role="gridcell">
                <StatusBadge account={account} />
              </div>

              <div className="plan-cell" role="gridcell">
                <span className="plan-name">
                  {hasSnapshot
                    ? getPlanLabel(getAccountPlan(account))
                    : "--"}
                </span>
              </div>

              <div className="quota-column quota-column--primary" role="gridcell">
                <QuotaBar
                  value={remainingPercent(primary)}
                  label="5 小时"
                  resetsAt={primary?.resetsAt}
                  emptyLabel={connected ? "未读取" : "--"}
                  emptyHint={connected ? "数据缺失" : "--:--:--"}
                  cached={cachedQuotaTypes.includes("primary")}
                />
              </div>

              <div className="quota-column quota-column--secondary" role="gridcell">
                <QuotaBar
                  value={remainingPercent(secondary)}
                  label="周"
                  resetsAt={secondary?.resetsAt}
                  emptyLabel={connected ? "未读取" : "--"}
                  emptyHint={connected ? "数据缺失" : "--:--:--"}
                  cached={cachedQuotaTypes.includes("secondary")}
                />
              </div>

              <div className="reset-count-cell" role="gridcell">
                {resetCount === null ? (
                  <span className="muted-value">--</span>
                ) : resetCount > 0 ? (
                  <Badge appearance="filled" color="success" size="medium">
                    {resetCount} 张
                  </Badge>
                ) : (
                  <span className="muted-value">0 张</span>
                )}
              </div>

              <div className="row-actions" role="gridcell">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<MoreHorizontal20Regular />}
                  aria-label="更多操作"
                  aria-haspopup="menu"
                  aria-expanded={menuState?.accountId === account.id}
                  data-account-menu-trigger={account.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (menuState?.accountId === account.id) {
                      setMenuState(null);
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    const width = 156;
                    const height = connected ? 204 : 164;
                    const left = Math.max(
                      8,
                      Math.min(rect.right - width, window.innerWidth - width - 8),
                    );
                    const below = rect.bottom + 4;
                    const top =
                      below + height <= window.innerHeight - 8
                        ? below
                        : Math.max(8, rect.top - height - 4);
                    setMenuState({ accountId: account.id, top, left });
                  }}
                />

                {menuState?.accountId === account.id ? (
                  <div
                    ref={menuRef}
                    className="local-command-menu"
                    role="menu"
                    style={{ top: menuState.top, left: menuState.left }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        runMenuAction(() =>
                          connected
                            ? onLaunch(account.id)
                            : onLogin(account.id),
                        )
                      }
                    >
                      {connected ? <Play20Regular /> : <Open20Regular />}
                      <span>{connected ? "启动 Codex" : "登录 ChatGPT"}</span>
                    </button>
                    {connected ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          runMenuAction(() => onLogin(account.id))
                        }
                      >
                        <ArrowSync20Regular />
                        <span>重新登录</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runMenuAction(() => onRename(account))}
                    >
                      <Edit20Regular />
                      <span>重命名</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        runMenuAction(() => onOpenProfile(account.id))
                      }
                    >
                      <FolderOpen20Regular />
                      <span>打开配置目录</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() => runMenuAction(() => onDelete(account))}
                    >
                      <Delete20Regular />
                      <span>移除账号</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
