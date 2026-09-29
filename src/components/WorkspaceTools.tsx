import type { AppView, ManagedAccount } from "../types";
import { ExtensionManager } from "./workspace/ExtensionManager";
import {
  AuthManager,
  BackupManager,
  ConfigEditor,
  DiagnosticsPage,
  SettingsPage,
} from "./workspace/MaintenancePages";
import { PromptManager } from "./workspace/PromptManager";
import { ProviderManager } from "./workspace/ProviderManager";
import { SessionManager } from "./workspace/SessionManager";
import { WorkspaceOverview } from "./workspace/WorkspaceOverview";
import type { Notify } from "./workspace/WorkspaceCommon";

type WorkspaceView = Exclude<AppView, "accounts" | "about">;

interface WorkspaceToolsProps {
  view: WorkspaceView;
  accounts: ManagedAccount[];
  selectedId: string | null;
  onSelect(id: string): void;
  onNotify: Notify;
  onNavigate(view: AppView): void;
  onLogin(id: string): void;
  autoRefreshEnabled: boolean;
  autoRefreshMinutes: number;
  onAutoRefreshEnabled(value: boolean): void;
  onAutoRefreshMinutes(value: number): void;
}

export function WorkspaceTools({
  view,
  accounts,
  selectedId,
  onSelect,
  onNotify,
  onNavigate,
  onLogin,
  autoRefreshEnabled,
  autoRefreshMinutes,
  onAutoRefreshEnabled,
  onAutoRefreshMinutes,
}: WorkspaceToolsProps) {
  const accountId =
    selectedId && accounts.some((account) => account.id === selectedId)
      ? selectedId
      : accounts[0]?.id || null;
  const shared = { accounts, accountId, onSelect, notify: onNotify };

  if (view === "workspace") return <WorkspaceOverview {...shared} onNavigate={onNavigate} />;
  if (view === "prompts") return <PromptManager {...shared} />;
  if (view === "providers") return <ProviderManager {...shared} />;
  if (view === "extensions") return <ExtensionManager {...shared} />;
  if (view === "sessions") return <SessionManager {...shared} />;
  if (view === "config") return <ConfigEditor {...shared} />;
  if (view === "auth") return <AuthManager {...shared} onLogin={onLogin} />;
  if (view === "backups") return <BackupManager {...shared} />;
  if (view === "diagnostics") {
    return (
      <DiagnosticsPage
        {...shared}
        onNavigate={onNavigate}
        onLogin={onLogin}
      />
    );
  }
  return (
    <SettingsPage
      {...shared}
      autoRefreshEnabled={autoRefreshEnabled}
      autoRefreshMinutes={autoRefreshMinutes}
      onAutoRefreshEnabled={onAutoRefreshEnabled}
      onAutoRefreshMinutes={onAutoRefreshMinutes}
    />
  );
}
