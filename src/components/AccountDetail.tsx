import {
  Badge,
  Button,
  Spinner,
} from "@fluentui/react-components";
import {
  CheckmarkCircle20Regular,
  Clock20Regular,
  ErrorCircle20Filled,
  FolderOpen20Regular,
  Globe20Regular,
  Open20Regular,
  Play20Regular,
  TicketDiagonal20Regular,
  Warning20Regular,
  WalletCreditCard20Regular,
} from "@fluentui/react-icons";
import type { ManagedAccount, ResetCredit } from "../types";
import {
  formatElapsedSinceReset,
  formatExpiry,
  formatFullResetDateTime,
  formatUpdatedAt,
  getAccountEmail,
  getAccountHealth,
  getAccountPlan,
  getAvailableResetCredits,
  getMissingQuotaLabel,
  getPlanLabel,
  getResetCreditDisplay,
  isSuspectedBugAccount,
  remainingPercent,
} from "../utils";
import { QuotaBar } from "./QuotaBar";

interface AccountDetailProps {
  account: ManagedAccount | null;
  now: number;
  loggingIn: boolean;
  consumingCreditId: string | null;
  onLogin(id: string): void;
  onLaunch(id: string): void;
  onOpenProfile(id: string): void;
  onOpenUsage(): void;
  onOpenCodexWeb(): void;
  onConsume(account: ManagedAccount, credit: ResetCredit): void;
}

export function AccountDetail({
  account,
  now,
  loggingIn,
  consumingCreditId,
  onLogin,
  onLaunch,
  onOpenProfile,
  onOpenUsage,
  onOpenCodexWeb,
  onConsume,
}: AccountDetailProps) {
  if (!account) {
    return (
      <aside className="detail-panel detail-panel--empty" aria-label="账号详情">
        <div className="detail-empty__icon">
          <WalletCreditCard20Regular />
        </div>
        <strong>未选择账号</strong>
      </aside>
    );
  }

  const limits = account.rateLimitData?.rateLimits;
  const resetSummary = account.rateLimitData?.rateLimitResetCredits;
  const resetCredits = resetSummary
    ? getAvailableResetCredits(account, now)
    : null;
  const resetCount = resetCredits?.length ?? 0;
  const connected = account.status === "connected";
  const hasSnapshot = Boolean(account.account);
  const primaryRemaining = remainingPercent(limits?.primary);
  const secondaryRemaining = remainingPercent(limits?.secondary);
  const health = getAccountHealth(account);
  const missingQuotaLabel = getMissingQuotaLabel(account);
  const cachedQuotaTypes =
    account.rateLimitData?.quotaReadStatus?.cachedQuotaTypes || [];
  const officialResetEvents = (account.usageStats?.events || []).filter(
    (event) => event.type === "unexpected-official-reset",
  );
  const lastOfficialResetAt = account.usageStats?.lastOfficialResetAt || null;
  const suspectedBugAccount = isSuspectedBugAccount(account);
  const statusLabel =
    suspectedBugAccount
      ? "疑似 BUG号"
      : account.status === "connected"
      ? "已连接"
      : account.status === "error"
        ? "异常"
        : "未登录";
  const creditBalance = limits?.credits
    ? limits.credits.unlimited
      ? "无限 Credits"
      : limits.credits.hasCredits
        ? `${limits.credits.balance ?? "0"} Credits`
        : "未启用 Credits"
    : null;

  return (
    <aside className="detail-panel" aria-label={`${account.label} 账号详情`}>
      <header className="detail-header">
        <div className="detail-header__identity">
          <div className="detail-avatar" aria-hidden="true">
            {account.label.slice(0, 1).toLocaleUpperCase("zh-CN")}
          </div>
          <div className="detail-header__copy">
            <h2>{account.label}</h2>
            <span>{getAccountEmail(account)}</span>
          </div>
        </div>
      </header>

      <div className="detail-meta">
        <div>
          <span className="detail-meta__label">状态</span>
          <Badge
            appearance="tint"
            color={
              account.status === "connected"
                ? suspectedBugAccount
                  ? "warning"
                  : "success"
                : account.status === "error"
                  ? "danger"
                  : "subtle"
            }
            size="small"
          >
            {statusLabel}
          </Badge>
        </div>
        <div>
          <span className="detail-meta__label">套餐</span>
          <strong>
            {hasSnapshot ? getPlanLabel(getAccountPlan(account)) : "--"}
          </strong>
        </div>
        <div>
          <span className="detail-meta__label">最近刷新</span>
          <strong>{formatUpdatedAt(account.updatedAt)}</strong>
        </div>
      </div>

      <div
        className={`detail-health is-${health.tone}${
          connected && missingQuotaLabel ? " has-action" : ""
        }`}
      >
        <span className="detail-health__icon" aria-hidden="true">
          {health.tone === "healthy" ? (
            <CheckmarkCircle20Regular />
          ) : health.tone === "danger" ? (
            <ErrorCircle20Filled />
          ) : (
            <Warning20Regular />
          )}
        </span>
        <div className="detail-health__copy">
          <strong>{health.label}</strong>
          <span>{health.description}</span>
        </div>
        {connected && missingQuotaLabel ? (
          <Button
            className="detail-health__action"
            appearance="subtle"
            size="small"
            icon={loggingIn ? <Spinner size="tiny" /> : <Open20Regular />}
            disabled={loggingIn}
            onClick={() => onLogin(account.id)}
          >
            {loggingIn ? "登录中" : "重新登录"}
          </Button>
        ) : null}
      </div>

      {!connected ? (
        <div className="signed-out-state">
          <Open20Regular />
          <strong>等待登录</strong>
          <Button
            appearance="primary"
            icon={loggingIn ? <Spinner size="tiny" /> : <Open20Regular />}
            aria-label="登录 ChatGPT"
            disabled={loggingIn}
            onClick={() => onLogin(account.id)}
          >
            {loggingIn ? "等待浏览器授权" : "登录 ChatGPT"}
          </Button>
        </div>
      ) : (
        <>
          <section className="detail-section" aria-labelledby="quota-heading">
            <div className="section-heading-row">
              <h3 id="quota-heading">额度窗口</h3>
              {creditBalance ? (
                <span className="credit-balance">
                  <WalletCreditCard20Regular />
                  {creditBalance}
                </span>
              ) : null}
            </div>

            <div className="quota-detail-row">
              <div className="quota-detail-row__label">
                <span>5 小时</span>
                <strong>
                  {primaryRemaining === null
                    ? "未读取"
                    : `${primaryRemaining}% 剩余`}
                </strong>
              </div>
              <QuotaBar
                value={primaryRemaining}
                label="5 小时"
                resetsAt={limits?.primary?.resetsAt}
                cached={cachedQuotaTypes.includes("primary")}
              />
            </div>

            <div className="quota-detail-row">
              <div className="quota-detail-row__label">
                <span>每周</span>
                <strong>
                  {secondaryRemaining === null
                    ? "未读取"
                    : `${secondaryRemaining}% 剩余`}
                </strong>
              </div>
              <QuotaBar
                value={secondaryRemaining}
                label="周"
                resetsAt={limits?.secondary?.resetsAt}
                cached={cachedQuotaTypes.includes("secondary")}
              />
            </div>

            {limits?.individualLimit ? (
              <div className="quota-detail-row">
                <div className="quota-detail-row__label">
                  <span>个人限额</span>
                  <strong>{limits.individualLimit.remainingPercent}% 剩余</strong>
                </div>
                <QuotaBar
                  value={limits.individualLimit.remainingPercent}
                  label="个人限额"
                  resetsAt={limits.individualLimit.resetsAt}
                />
              </div>
            ) : null}
          </section>

          <section
            className="detail-section detail-section--usage"
            aria-labelledby="usage-history-heading"
          >
            <div className="section-heading-row">
              <h3 id="usage-history-heading">异常官方重置</h3>
              <span className="section-heading-note">
                只记录提前恢复全部额度
              </span>
            </div>
            {lastOfficialResetAt ? (
              <>
                <div className="official-reset-summary">
                  <div>
                    <span>距离上次异常官方重置</span>
                    <strong>{formatElapsedSinceReset(lastOfficialResetAt, now)}</strong>
                  </div>
                  <div>
                    <span>上次重置时间为</span>
                    <time dateTime={lastOfficialResetAt}>
                      {formatFullResetDateTime(lastOfficialResetAt)}
                    </time>
                  </div>
                </div>
                {officialResetEvents.length > 1 ? (
                  <div className="official-reset-list" aria-label="历史异常官方重置">
                    {officialResetEvents.slice(1, 8).map((event) => (
                      <div className="official-reset-row" key={event.id}>
                        <span>异常恢复全部额度</span>
                        <time dateTime={event.occurredAt}>
                          {formatFullResetDateTime(event.occurredAt)}
                        </time>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-inline">尚未检测到异常提前重置</div>
            )}
          </section>

          <section className="detail-section" aria-labelledby="reset-heading">
            <div className="section-heading-row">
              <h3 id="reset-heading">重置卡</h3>
              {resetSummary && resetCount > 0 ? (
                <Badge
                  appearance="filled"
                  color="success"
                  size="medium"
                >
                  {resetCount} 张可用
                </Badge>
              ) : null}
            </div>

            {resetSummary === null || resetSummary === undefined ? (
              <div className="empty-inline">服务端未返回重置卡信息</div>
            ) : resetCredits === null || resetCredits.length === 0 ? (
              <div className="empty-inline">未检测到真实可用的重置卡</div>
            ) : (
              <div className="reset-list">
                {resetCredits.map((credit) => {
                  const display = getResetCreditDisplay(credit);

                  return (
                    <article className="reset-card" key={credit.id}>
                      <div className="reset-card__icon">
                        <TicketDiagonal20Regular />
                      </div>
                      <div className="reset-card__content">
                        <strong>{display.title}</strong>
                        <span className="reset-card__scope">{display.scope}</span>
                        <span>
                          <Clock20Regular />
                          {formatExpiry(credit.expiresAt, now)}
                        </span>
                      </div>
                      <Button
                        className="reset-card__action"
                        appearance="primary"
                        size="small"
                        aria-label={`使用重置卡：${display.title}`}
                        disabled={consumingCreditId === credit.id}
                        icon={
                          consumingCreditId === credit.id ? (
                            <Spinner size="tiny" />
                          ) : undefined
                        }
                        onClick={() => onConsume(account, credit)}
                      >
                        使用重置卡
                      </Button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="detail-actions">
        <Button
          appearance="primary"
          icon={<Play20Regular />}
          aria-label="启动 Codex"
          disabled={!connected}
          onClick={() => onLaunch(account.id)}
        >
          启动 Codex
        </Button>
        <Button
          appearance="secondary"
          icon={<Globe20Regular />}
          aria-label="打开用量页面"
          onClick={onOpenUsage}
        >
          用量页面
        </Button>
        <Button
          appearance="subtle"
          icon={<FolderOpen20Regular />}
          aria-label="打开本地配置目录"
          onClick={() => onOpenProfile(account.id)}
        />
        <Button
          appearance="subtle"
          icon={<Open20Regular />}
          aria-label="打开 Codex 网页"
          onClick={onOpenCodexWeb}
        />
      </footer>
    </aside>
  );
}
