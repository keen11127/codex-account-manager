import { useSecondClock } from "../clock";
import { formatCountdown } from "../utils";

interface QuotaBarProps {
  value: number | null;
  label: string;
  resetsAt: number | null | undefined;
  emptyLabel?: string;
  emptyHint?: string;
  cached?: boolean;
}

function getTone(value: number | null) {
  if (value === null) return "neutral";
  if (value <= 15) return "danger";
  if (value <= 35) return "warning";
  return "healthy";
}

export function QuotaBar({
  value,
  label,
  resetsAt,
  emptyLabel = "未读取",
  emptyHint = "数据缺失",
  cached = false,
}: QuotaBarProps) {
  const now = useSecondClock();
  const countdown = formatCountdown(resetsAt, now);
  const percent = value ?? 0;
  const tone = getTone(value);
  const exhausted = value === 0;

  return (
    <div
      className={`quota-cell quota-cell--${tone}${
        exhausted ? " is-exhausted" : ""
      }${cached ? " is-cached" : ""}`}
    >
      <div className="quota-cell__topline">
        <span className="quota-cell__value">
          {value === null
            ? emptyLabel
            : exhausted
              ? "0% · 已用完"
              : `${value}% 剩余`}
        </span>
        <span className="quota-cell__countdown">
          {value === null ? emptyHint : cached ? `上次 · ${countdown}` : countdown}
        </span>
      </div>
      <div
        className={`quota-track${exhausted ? " is-exhausted" : ""}`}
        role="progressbar"
        aria-label={`${label}剩余额度`}
        aria-valuetext={
          value === null ? emptyLabel : exhausted ? "已用完" : `${value}% 剩余`
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
      >
        <span
          className={`quota-track__fill quota-track__fill--${tone}`}
          style={{ width: exhausted ? "100%" : `${percent}%` }}
        />
      </div>
    </div>
  );
}
