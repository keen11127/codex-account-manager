import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  CheckmarkCircle20Filled,
  Code20Regular,
  Eye20Regular,
  EyeOff20Regular,
  FolderOpen20Regular,
  Key20Regular,
  Save20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { bridge } from "../../bridge";
import type {
  AppView,
  DiagnosticReport,
  ManagedAccount,
  ManagedBackup,
  ManagedTextFile,
} from "../../types";
import {
  WorkspaceEmpty,
  WorkspaceHeader,
  WorkspaceModal,
  formatWorkspaceBytes,
  formatWorkspaceDate,
  type Notify,
} from "./WorkspaceCommon";

type SharedProps = {
  accounts: ManagedAccount[];
  accountId: string | null;
  onSelect(id: string): void;
  notify: Notify;
};

export function ConfigEditor(props: SharedProps) {
  const { accounts, accountId, onSelect, notify } = props;
  const [file, setFile] = useState<ManagedTextFile | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) {
      setFile(null);
      setDraft("");
      return;
    }
    setLoading(true);
    try {
      const next = await bridge.readManagedFile(accountId, "config");
      setFile(next);
      setDraft(next.content);
    } catch (error) {
      notify("配置读取失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }, [accountId, notify]);
  useEffect(() => void load(), [load]);

  const save = async () => {
    if (!accountId) return;
    setSaving(true);
    try {
      const next = await bridge.writeManagedFile(accountId, "config", draft);
      setFile(next);
      notify("配置已保存", next.backupPath ? "原文件已自动备份" : "config.toml 已创建", "success");
    } catch (error) {
      notify("保存失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return <section className="workspace-page config-editor-page">
    <WorkspaceHeader eyebrow="CONFIG.TOML" title="Codex 配置" description="查看和编辑当前账号正在使用的 live TOML；每次写入前自动备份。" accounts={accounts} selectedId={accountId} onSelect={onSelect} actions={<>
      <Button icon={<FolderOpen20Regular />} disabled={!accountId} onClick={() => accountId && void bridge.openToolPath(accountId, "config")}>定位文件</Button>
      <Button icon={<ArrowClockwise20Regular />} disabled={loading || saving} onClick={() => void load()}>重新读取</Button>
      <Button icon={<Save20Regular />} disabled={loading || saving || !file || file.content === draft} onClick={() => void save()}>{saving ? "保存中" : "保存配置"}</Button>
    </>} />
    {!accountId ? <WorkspaceEmpty /> : loading && !file ? <div className="workspace-loading"><Spinner label="正在读取配置" /></div> : <section className="code-editor-surface">
      <header><div><Code20Regular /><span><strong>{file?.path || "config.toml"}</strong><small>{file?.exists ? `最近保存 ${formatWorkspaceDate(file.updatedAt)}` : "文件尚未创建"}{file && file.content !== draft ? " · 有未保存修改" : ""}</small></span></div><b>{draft.split(/\r?\n/).length} 行</b></header>
      <textarea className="code-editor" value={draft} spellCheck={false} onChange={(event) => setDraft(event.target.value)} aria-label="config.toml 编辑器" />
    </section>}
  </section>;
}

export function AuthManager(props: SharedProps & { onLogin(id: string): void }) {
  const { accounts, accountId, onSelect, notify, onLogin } = props;
  const [file, setFile] = useState<ManagedTextFile | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) {
      setFile(null);
      setDraft("");
      setRevealed(false);
      return;
    }
    setLoading(true);
    try {
      const next = await bridge.readManagedFile(accountId, "auth");
      setFile(next);
      setDraft(next.content);
      setRevealed(false);
    } catch (error) {
      notify("登录凭据读取失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }, [accountId, notify]);
  useEffect(() => void load(), [load]);

  const summary = (() => {
    try {
      const parsed = JSON.parse(file?.content || "{}");
      const fields = Object.entries(parsed).filter(([key, value]) => key !== "auth_mode" && value != null && value !== "").length;
      return {
        valid: Boolean(file?.exists),
        mode: typeof parsed.auth_mode === "string" ? parsed.auth_mode : "自动识别",
        fields,
      };
    } catch {
      return { valid: false, mode: "格式异常", fields: 0 };
    }
  })();

  const save = async () => {
    if (!accountId) return;
    setSaving(true);
    try {
      const next = await bridge.writeManagedFile(accountId, "auth", draft);
      setFile(next);
      setDraft(next.content);
      setConfirmSave(false);
      setRevealed(false);
      notify("登录凭据已保存", next.backupPath ? "原 auth.json 已自动备份" : "auth.json 已创建", "success");
    } catch (error) {
      notify("凭据保存失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return <section className="workspace-page auth-manager-page">
    <WorkspaceHeader eyebrow="AUTH.JSON" title="登录凭据" description="查看或维护当前账号的官方登录文件；内容默认隐藏，每次写入前自动备份。" accounts={accounts} selectedId={accountId} onSelect={onSelect} actions={<>
      <Button icon={<FolderOpen20Regular />} disabled={!accountId} onClick={() => accountId && void bridge.openToolPath(accountId, "auth")}>定位文件</Button>
      <Button icon={<ArrowClockwise20Regular />} disabled={loading || saving} onClick={() => void load()}>重新读取</Button>
      <Button icon={<Key20Regular />} disabled={!accountId || saving} onClick={() => accountId && onLogin(accountId)}>重新登录</Button>
      <Button icon={revealed ? <EyeOff20Regular /> : <Eye20Regular />} disabled={!file?.exists} onClick={() => setRevealed((value) => !value)}>{revealed ? "隐藏内容" : "显示并编辑"}</Button>
      {revealed ? <Button icon={<Save20Regular />} disabled={loading || saving || !file || file.content === draft} onClick={() => setConfirmSave(true)}>保存凭据</Button> : null}
    </>} />
    {!accountId ? <WorkspaceEmpty /> : loading && !file ? <div className="workspace-loading"><Spinner label="正在读取登录凭据" /></div> : !revealed ? <section className="auth-protection-surface">
      <span><Key20Regular /></span>
      <div><strong>{summary.valid ? "登录文件已就绪" : file?.exists ? "登录文件需要检查" : "当前账号尚未登录"}</strong><p>认证方式：{summary.mode} · 已检测 {summary.fields} 组凭据字段</p><small>{file?.path || "auth.json"}</small></div>
      <Button icon={<Eye20Regular />} disabled={!file?.exists} onClick={() => setRevealed(true)}>显示并编辑</Button>
    </section> : <section className="code-editor-surface auth-editor-surface">
      <header><div><Key20Regular /><span><strong>{file?.path || "auth.json"}</strong><small>{file?.exists ? `最近保存 ${formatWorkspaceDate(file.updatedAt)}` : "文件尚未创建"}{file && file.content !== draft ? " · 有未保存修改" : ""}</small></span></div><b>{draft.split(/\r?\n/).length} 行</b></header>
      <textarea className="code-editor" value={draft} spellCheck={false} onChange={(event) => setDraft(event.target.value)} aria-label="auth.json 编辑器" />
    </section>}
    <WorkspaceModal open={confirmSave} title="确认保存登录凭据" description="写入前会备份当前 auth.json；错误内容可能导致当前账号退出登录。" onClose={() => setConfirmSave(false)} actions={<><Button onClick={() => setConfirmSave(false)}>取消</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "保存中" : "确认保存"}</Button></>}>
      <div className="modal-confirm-copy"><strong>仅更新当前所选账号</strong><p>其他账号的登录文件不会改变。</p></div>
    </WorkspaceModal>
  </section>;
}

export function BackupManager(props: SharedProps) {
  const { accounts, accountId, onSelect, notify } = props;
  const [backups, setBackups] = useState<ManagedBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<ManagedBackup | null>(null);
  const [restoring, setRestoring] = useState(false);
  const load = useCallback(async () => {
    if (!accountId) return setBackups([]);
    setLoading(true);
    try { setBackups(await bridge.listBackups(accountId)); } catch (error) { notify("备份读取失败", error instanceof Error ? error.message : String(error), "error"); } finally { setLoading(false); }
  }, [accountId, notify]);
  useEffect(() => void load(), [load]);
  const restore = async () => {
    if (!accountId || !target) return;
    setRestoring(true);
    try {
      const result = await bridge.restoreBackup(accountId, target.id);
      setBackups(result.backups);
      notify("备份已恢复", target.kind === "config" ? "config.toml 已恢复" : target.kind === "auth" ? "auth.json 已恢复" : "AGENTS.md 已恢复", "success");
      setTarget(null);
    } catch (error) { notify("恢复失败", error instanceof Error ? error.message : String(error), "error"); } finally { setRestoring(false); }
  };
  return <section className="workspace-page backup-manager">
    <WorkspaceHeader eyebrow="BACKUPS" title="备份与恢复" description="保存配置和提示词前自动生成的版本，可按文件类型恢复。" accounts={accounts} selectedId={accountId} onSelect={onSelect} actions={<Button icon={<ArrowClockwise20Regular />} disabled={loading} onClick={() => void load()}>刷新备份</Button>} />
    {!accountId ? <WorkspaceEmpty /> : loading && backups.length === 0 ? <div className="workspace-loading"><Spinner label="正在读取备份" /></div> : <section className="backup-surface">
      <header><span>最近 100 个备份</span><small>恢复前会再次备份当前文件</small></header>
      <div>{backups.map((backup) => <article key={backup.id}><span className="backup-type">{backup.kind === "config" ? "TOML" : backup.kind === "auth" ? "AUTH" : "AGENTS"}</span><div><strong>{backup.kind === "config" ? "Codex 配置" : backup.kind === "auth" ? "登录凭据" : "指令文件"}</strong><small>{backup.name}</small></div><time>{formatWorkspaceDate(backup.createdAt)}</time><span>{formatWorkspaceBytes(backup.sizeBytes)}</span><Button size="small" onClick={() => setTarget(backup)}>恢复</Button></article>)}{backups.length === 0 ? <WorkspaceEmpty title="还没有备份" detail="首次保存配置或启用提示词后会自动创建。" /> : null}</div>
    </section>}
    <WorkspaceModal open={Boolean(target)} title="确认恢复备份" description="当前文件会先自动备份，再用所选版本替换。" onClose={() => setTarget(null)} actions={<><Button onClick={() => setTarget(null)}>取消</Button><Button disabled={restoring} onClick={() => void restore()}>{restoring ? "恢复中" : "确认恢复"}</Button></>}><div className="modal-confirm-copy"><strong>{target?.name}</strong><p>{formatWorkspaceDate(target?.createdAt)} · {target ? formatWorkspaceBytes(target.sizeBytes) : ""}</p></div></WorkspaceModal>
  </section>;
}

export function DiagnosticsPage(props: SharedProps & { onNavigate(view: AppView): void; onLogin(id: string): void }) {
  const { accounts, accountId, onSelect, notify, onNavigate, onLogin } = props;
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const run = useCallback(async () => {
    if (!accountId) return setReport(null);
    setLoading(true);
    try { setReport(await bridge.runDiagnostics(accountId)); } catch (error) { notify("诊断失败", error instanceof Error ? error.message : String(error), "error"); } finally { setLoading(false); }
  }, [accountId, notify]);
  useEffect(() => void run(), [run]);
  const action = (value: string | null) => {
    if (!accountId || !value) return;
    if (value === "relogin") onLogin(accountId);
    else if (value === "repair-config") setRepairOpen(true);
    else if (value === "open-config") onNavigate("config");
    else if (value === "open-skills" || value === "open-sessions") onNavigate(value === "open-skills" ? "extensions" : "sessions");
  };
  const repair = async () => {
    if (!accountId || !report?.configHealth) return;
    setRepairing(true);
    try {
      const result = await bridge.repairConfigHealth(accountId, report.configHealth.fingerprint);
      notify(result.changed ? "配置已修复" : "配置无需修改", result.backupPath ? "原配置已自动备份" : undefined, "success");
      setRepairOpen(false);
      await run();
    } catch (error) {
      notify("配置修复失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setRepairing(false);
    }
  };
  return <section className="workspace-page diagnostics-page">
    <WorkspaceHeader eyebrow="DIAGNOSTICS" title="环境诊断" description="检查登录文件、配置、扩展、会话和目录写入状态。" accounts={accounts} selectedId={accountId} onSelect={onSelect} actions={<Button icon={<ArrowClockwise20Regular />} disabled={loading} onClick={() => void run()}>重新检查</Button>} />
    {!accountId ? <WorkspaceEmpty /> : loading && !report ? <div className="workspace-loading"><Spinner label="正在执行诊断" /></div> : report ? <>
      <section className={`diagnostic-summary is-${report.status}`}><span>{report.status === "ok" ? <CheckmarkCircle20Filled /> : <Warning20Regular />}</span><div><strong>{report.status === "ok" ? "当前环境状态正常" : report.status === "warning" ? "发现需要关注的项目" : "发现异常项目"}</strong><small>检查时间 {formatWorkspaceDate(report.checkedAt)}</small></div><code>{report.codexHome}</code></section>
      <section className="diagnostic-list">{report.checks.map((check) => <article key={check.id}><span className={`diagnostic-icon is-${check.status}`}>{check.status === "ok" ? <CheckmarkCircle20Filled /> : <Warning20Regular />}</span><div><strong>{check.label}</strong><span>{check.detail}</span></div><b className={`status-pill ${check.status === "ok" ? "is-ok" : check.status === "error" ? "is-error" : "is-warning"}`}>{check.status === "ok" ? "正常" : check.status === "error" ? "异常" : "注意"}</b>{check.action ? <Button size="small" onClick={() => action(check.action)}>{check.action === "relogin" ? "重新登录" : check.action === "repair-config" ? "自动修复" : "前往处理"}</Button> : <span />}</article>)}</section>
    </> : null}
    <WorkspaceModal open={repairOpen} title="修复 Codex 配置" description="只补全已确认缺失的供应商字段，写入前会备份当前 config.toml。" onClose={() => setRepairOpen(false)} actions={<><Button onClick={() => setRepairOpen(false)}>取消</Button><Button disabled={repairing} onClick={() => void repair()}>{repairing ? "修复中" : "确认修复"}</Button></>}>
      <div className="repair-plan">{report?.configHealth?.repairSummary.map((item) => <div key={item}><CheckmarkCircle20Filled /><span>{item}</span></div>)}</div>
    </WorkspaceModal>
  </section>;
}

export function SettingsPage(props: SharedProps & {
  autoRefreshEnabled: boolean;
  autoRefreshMinutes: number;
  onAutoRefreshEnabled(value: boolean): void;
  onAutoRefreshMinutes(value: number): void;
}) {
  const { accounts, accountId, onSelect, autoRefreshEnabled, autoRefreshMinutes, onAutoRefreshEnabled, onAutoRefreshMinutes } = props;
  return <section className="workspace-page settings-page">
    <WorkspaceHeader eyebrow="SETTINGS" title="应用设置" description="调整自动刷新与本地运行选项；设置会保存在本机。" accounts={accounts} selectedId={accountId} onSelect={onSelect} />
    <section className="settings-surface">
      <header><strong>账号刷新</strong><span>每次只刷新一个账号，避免同时创建多个后台连接。</span></header>
      <div className="setting-row"><div><strong>自动刷新额度</strong><span>仅在窗口运行时执行，账号逐个串行刷新。</span></div><button className="blue-switch" type="button" role="switch" aria-checked={autoRefreshEnabled} onClick={() => onAutoRefreshEnabled(!autoRefreshEnabled)}><span /></button></div>
      <div className="setting-row"><div><strong>刷新间隔</strong><span>账号较多时可适当延长间隔以降低资源占用。</span></div><select disabled={!autoRefreshEnabled} value={autoRefreshMinutes} onChange={(event) => onAutoRefreshMinutes(Number(event.target.value))}><option value={1}>每 1 分钟</option><option value={2}>每 2 分钟</option><option value={5}>每 5 分钟</option><option value={10}>每 10 分钟</option></select></div>
    </section>
    <section className="settings-surface">
      <header><strong>本地数据</strong><span>账号登录、配置、会话和备份均保存在 D 盘。</span></header>
      <div className="setting-row"><div><strong>应用数据目录</strong><span>D:\codex-account-manager-data</span></div><Button icon={<FolderOpen20Regular />} onClick={() => void bridge.openDataDirectory()}>打开目录</Button></div>
      <div className="setting-row"><div><strong>当前账号目录</strong><span>{accounts.find((item) => item.id === accountId)?.codexHome || "尚未选择账号"}</span></div><Button icon={<FolderOpen20Regular />} disabled={!accountId} onClick={() => accountId && void bridge.openToolPath(accountId, "home")}>打开目录</Button></div>
    </section>
  </section>;
}
