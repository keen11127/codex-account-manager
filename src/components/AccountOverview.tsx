import { Badge, Button } from "@fluentui/react-components";
import {
  CalendarClock20Regular,
  CheckmarkCircle20Regular,
  ErrorCircle20Filled,
  TicketDiagonal20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import type { ManagedAccount } from "../types";
import {
  formatTimeUntil,
  getAccountHealth,
} from "../utils";

interface AccountOverviewProps {
  accounts: ManagedAccount[];
  now: number;
  onSelect(id: string): void;
  availableResetCount: number;
  onBulkReset(): void;
}

interface ScheduleItem {
  id: string;
  account: ManagedAccount;
  label: string;
  timestamp: number;
  kind: "reset" | "credit";
}

const toneOrder = { danger: 0, warning: 1, neutral: 2, healthy: 3 } as const;

export function AccountOverview({
  accounts,
  now,
  onSelect,
  availableResetCount,
  onBulkReset,
}: AccountOverviewProps) {
  const attention = accounts
    .map((account) => ({ account, health: getAccountHealth(account) }))
    .filter(({ health }) => health.tone !== "healthy")
    .sort((a, b) => toneOrder[a.health.tone] - toneOrder[b.health.tone])
    .slice(0, 3);

  const schedule = accounts
    .flatMap<ScheduleItem>((account) => {
      const items: ScheduleItem[] = [];
      const limits = account.rateLimitData?.rateLimits;

      if (limits?.primary?.resetsAt) {
        items.push({
          id: `${account.id}-primary`,
          account,
          label: "5 小时额度重置",
          timestamp: limits.primary.resetsAt,
          kind: "reset",
        });
      }

      if (limits?.secondary?.resetsAt) {
        items.push({
          id: `${account.id}-secondary`,
          account,
          label: "每周额度重置",
          timestamp: limits.secondary.resetsAt,
          kind: "reset",
        });
      }

      for (const credit of account.rateLimitData?.rateLimitResetCredits?.credits || []) {
        if (credit.status === "available" && credit.expiresAt) {
          items.push({
            id: `${account.id}-${credit.id}`,
            account,
            label: "重置卡到期",
            timestamp: credit.expiresAt,
            kind: "credit",
          });
        }
      }

      return items;
    })
    .filter((item) => item.timestamp * 1000 > now)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 3);

  return (
    <section className="account-overview" aria-labelledby="overview-heading">
      <div className="account-overview__heading">
        <div>
          <h2 id="overview-heading">巡检摘要</h2>
          <span>风险账号与近期事件</span>
        </div>
        {availableResetCount > 0 ? (
          <Button
            className="bulk-reset-button"
            appearance="primary"
            size="small"
            icon={<TicketDiagonal20Regular />}
            onClick={onBulkReset}
          >
            批量使用重置卡 {availableResetCount}
          </Button>
        ) : null}
      </div>

      <div className="account-overview__columns">
        <div className="overview-group">
          <div className="overview-group__heading">
            <span>需要处理</span>
            <Badge
              appearance="tint"
              color={attention.length > 0 ? "warning" : "success"}
              size="small"
            >
              {attention.length}
            </Badge>
          </div>

          {attention.length === 0 ? (
            <div className="overview-empty overview-empty--healthy">
              <CheckmarkCircle20Regular />
              <div>
                <strong>所有账号状态正常</strong>
                <span>当前没有登录或额度异常</span>
              </div>
            </div>
          ) : (
            <div className="overview-list">
              {attention.map(({ account, health }) => (
                <button
                  className="overview-row"
                  type="button"
                  key={account.id}
                  onClick={() => onSelect(account.id)}
                >
                  <span className={`overview-row__icon is-${health.tone}`}>
                    {health.tone === "danger" ? (
                      <ErrorCircle20Filled />
                    ) : (
                      <Warning20Regular />
                    )}
                  </span>
                  <span className="overview-row__copy">
                    <strong>{account.label}</strong>
                    <span>{health.label}</span>
                  </span>
                  <span className={`overview-row__state is-${health.tone}`}>
                    {health.tone === "danger" ? "立即检查" : "待处理"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overview-group">
          <div className="overview-group__heading">
            <span>近期事件</span>
            <span className="overview-group__hint">按时间排序</span>
          </div>

          {schedule.length === 0 ? (
            <div className="overview-empty">
              <CalendarClock20Regular />
              <div>
                <strong>暂无时间信息</strong>
                <span>刷新账号后显示重置与到期事件</span>
              </div>
            </div>
          ) : (
            <div className="overview-list">
              {schedule.map((item) => (
                <button
                  className="overview-row"
                  type="button"
                  key={item.id}
                  onClick={() => onSelect(item.account.id)}
                >
                  <span
                    className={`overview-row__icon ${
                      item.kind === "credit" ? "is-credit" : "is-reset"
                    }`}
                  >
                    {item.kind === "credit" ? (
                      <TicketDiagonal20Regular />
                    ) : (
                      <CalendarClock20Regular />
                    )}
                  </span>
                  <span className="overview-row__copy">
                    <strong>{item.account.label}</strong>
                    <span>{item.label}</span>
                  </span>
                  <span className="overview-row__time">
                    {formatTimeUntil(item.timestamp, now)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
