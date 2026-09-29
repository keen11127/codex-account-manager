import { Button } from "@fluentui/react-components";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import type { ManagedAccount } from "../../types";

export type Notify = (
  title: string,
  body?: string,
  intent?: "success" | "error" | "warning" | "info",
) => void;

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  accounts,
  selectedId,
  onSelect,
  actions,
  showAccountPicker = true,
}: {
  eyebrow: string;
  title: string;
  description: string;
  accounts: ManagedAccount[];
  selectedId: string | null;
  onSelect(id: string): void;
  actions?: ReactNode;
  showAccountPicker?: boolean;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-heading">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="workspace-header__actions">
        {showAccountPicker ? <label className="account-picker">
          <span>当前账号</span>
          <select
            value={selectedId || ""}
            disabled={accounts.length === 0}
            onChange={(event) => onSelect(event.target.value)}
          >
            {accounts.length === 0 ? <option value="">暂无账号</option> : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label> : null}
        {actions}
      </div>
    </header>
  );
}

export function WorkspaceEmpty({
  title = "请先添加账号",
  detail = "此功能按账号隔离保存。",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="workspace-empty">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function WorkspaceModal({
  open,
  title,
  description,
  children,
  actions,
  onClose,
  width = "medium",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  actions: ReactNode;
  onClose(): void;
  width?: "medium" | "wide";
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="workspace-modal-layer"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className={`workspace-modal workspace-modal--${width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="workspace-modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <Button
            ref={closeRef}
            appearance="subtle"
            size="small"
            icon={<Dismiss20Regular />}
            aria-label="关闭"
            onClick={onClose}
          />
        </header>
        <div className="workspace-modal__body">{children}</div>
        <footer className="workspace-modal__footer">{actions}</footer>
      </section>
    </div>
  );
}

export function formatWorkspaceDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatWorkspaceBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
