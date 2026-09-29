import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowExport20Regular,
  ArrowSync20Regular,
  Delete20Regular,
  FolderOpen20Regular,
  History20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge } from "../../bridge";
import type { ManagedAccount, ManagedSession } from "../../types";
import {
  WorkspaceEmpty,
  WorkspaceHeader,
  WorkspaceModal,
  formatWorkspaceBytes,
  formatWorkspaceDate,
  type Notify,
} from "./WorkspaceCommon";

export function SessionManager({
  accounts,
  accountId,
  onSelect,
  notify,
}: {
  accounts: ManagedAccount[];
  accountId: string | null;
  onSelect(id: string): void;
  notify: Notify;
}) {
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("全部项目");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [permanentDelete, setPermanentDelete] = useState(false);
  const [targetConfig, setTargetConfig] = useState<{ provider: string | null; model: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const result = await bridge.getSessionStatus(accountId);
      setSessions(result.sessions);
      setTargetConfig(result.target);
      setSelected(new Set());
    } catch (error) {
      notify("会话读取失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }, [accountId, notify]);
  useEffect(() => void load(), [load]);

  const projects = useMemo(() => ["全部项目", ...new Set(sessions.map((item) => item.projectPath || "未标记项目"))], [sessions]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return sessions.filter((session) => {
      if (project !== "全部项目" && (session.projectPath || "未标记项目") !== project) return false;
      return !normalized || `${session.name} ${session.projectPath || ""} ${session.model || ""}`.toLocaleLowerCase("zh-CN").includes(normalized);
    });
  }, [project, query, sessions]);
  const selectedSessions = sessions.filter((item) => selected.has(item.id));

  const toggleAll = () => {
    const allVisibleSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));
    setSelected((current) => {
      const next = new Set(current);
      for (const item of filtered) allVisibleSelected ? next.delete(item.id) : next.add(item.id);
      return next;
    });
  };

  const exportSelected = async () => {
    if (!accountId || selectedSessions.length === 0) return;
    setBusy(true);
    try {
      const result = await bridge.exportSessions(accountId, selectedSessions.map((item) => item.id));
      if (result) notify("会话已导出", `${result.sessionCount} 个会话 · ${result.path}`, "success");
    } catch (error) {
      notify("导出失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    if (!accountId || selectedSessions.length === 0) return;
    setBusy(true);
    try {
      setSessions(await bridge.deleteSessions(accountId, selectedSessions.map((item) => item.id), permanentDelete));
      notify(permanentDelete ? "会话已永久删除" : "会话已移入回收站", `${selectedSessions.length} 个会话`, "success");
      setSelected(new Set());
      setConfirmDelete(false);
    } catch (error) {
      notify("删除失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const syncSelected = async () => {
    if (!accountId || selectedSessions.length === 0) return;
    setBusy(true);
    try {
      const result = await bridge.syncSessions(accountId, selectedSessions.map((item) => item.id));
      setSessions(result.status.sessions);
      setTargetConfig(result.status.target);
      setConfirmSync(false);
      notify("会话同步完成", `${result.changed} 个已更新，${result.skipped} 个跳过，${result.errors.length} 个失败`, result.errors.length ? "warning" : "success");
    } catch (error) {
      notify("会话同步失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const exportMarkdown = async () => {
    if (!accountId || selectedSessions.length === 0) return;
    setBusy(true);
    try {
      const result = await bridge.exportSessionsMarkdown(accountId, selectedSessions.map((item) => item.id));
      if (result) notify("Markdown 导出完成", result.path, "success");
    } catch (error) {
      notify("Markdown 导出失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return <section className="workspace-page session-manager">
    <WorkspaceHeader eyebrow="SESSIONS" title="会话管理" description="按项目搜索、批量导出或移入 Windows 回收站，保留可恢复路径。" accounts={accounts} selectedId={accountId} onSelect={onSelect} actions={<>
      <Button icon={<ArrowClockwise20Regular />} disabled={loading} onClick={() => void load()}>检查会话</Button>
      <Button icon={<ArrowSync20Regular />} disabled={busy || selected.size === 0} onClick={() => setConfirmSync(true)}>同步所选</Button>
      <Button icon={<ArrowExport20Regular />} disabled={busy || selected.size === 0} onClick={() => void exportSelected()}>导出所选</Button>
      <Button icon={<ArrowExport20Regular />} disabled={busy || selected.size === 0} onClick={() => void exportMarkdown()}>导出 Markdown</Button>
      <Button className="danger-button" icon={<Delete20Regular />} disabled={busy || selected.size === 0} onClick={() => setConfirmDelete(true)}>移入回收站</Button>
    </>} />
    {!accountId ? <WorkspaceEmpty /> : loading && sessions.length === 0 ? <div className="workspace-loading"><Spinner label="正在检查会话" /></div> : <>
      <div className="session-filterbar">
        <div><strong>{sessions.length} 个本地会话</strong><span>已选 {selected.size} 个 · 当前 {targetConfig?.provider || "未记录"} / {targetConfig?.model || "未记录"}</span></div>
        <select value={project} onChange={(event) => setProject(event.target.value)}>{projects.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <input value={query} placeholder="搜索标题、项目或模型" onChange={(event) => setQuery(event.target.value)} />
        <Button size="small" icon={<FolderOpen20Regular />} onClick={() => void bridge.openToolPath(accountId, "sessions")}>打开目录</Button>
      </div>
      <section className="session-table-surface">
        <header className="session-table__header">
          <label><input type="checkbox" checked={filtered.length > 0 && filtered.every((item) => selected.has(item.id))} onChange={toggleAll} aria-label="选择当前筛选结果" /></label>
          <span>会话 / 项目</span><span>模型</span><span>更新时间</span><span>大小</span><span>操作</span>
        </header>
        <div className="session-table__body">
          {filtered.map((session) => <article key={session.id} className={selected.has(session.id) ? "is-selected" : ""}>
            <label><input type="checkbox" checked={selected.has(session.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(session.id) : next.delete(session.id); return next; })} aria-label={`选择 ${session.name}`} /></label>
            <div className="session-name"><span><History20Regular /></span><div><strong>{session.name}</strong><small title={session.projectPath || undefined}>{session.projectPath || "未标记项目"}</small></div></div>
            <span className="session-model-state"><b>{session.model || "未记录"}</b><small className={session.syncStatus === "current" ? "is-current" : session.syncStatus === "outdated" ? "is-outdated" : ""}>{session.syncStatus === "current" ? "已同步" : session.syncStatus === "outdated" ? "待同步" : "未识别"}</small></span><time>{formatWorkspaceDate(session.updatedAt)}</time><span>{formatWorkspaceBytes(session.sizeBytes)}</span>
            <Button size="small" icon={<FolderOpen20Regular />} aria-label={`定位 ${session.name}`} onClick={() => void bridge.openSessionLocation(accountId, session.id)} />
          </article>)}
          {filtered.length === 0 ? <WorkspaceEmpty title={query || project !== "全部项目" ? "没有匹配的会话" : "未检测到本地会话"} detail={query || project !== "全部项目" ? "清除筛选条件后重试。" : "新会话产生后会自动出现在这里。"} /> : null}
        </div>
      </section>
    </>}
    <WorkspaceModal open={confirmDelete} title={permanentDelete ? "确认永久删除" : "确认移入回收站"} description={permanentDelete ? "永久删除后不会进入 Windows 回收站。" : "所选会话文件可在 Windows 回收站中恢复。"} onClose={() => setConfirmDelete(false)} actions={<><Button onClick={() => setConfirmDelete(false)}>取消</Button><Button className="danger-button" disabled={busy} onClick={() => void removeSelected()}>{busy ? "正在处理" : `确认处理 ${selectedSessions.length} 个`}</Button></>}>
      <div className="delete-preview"><label className="permanent-delete-option"><input type="checkbox" checked={permanentDelete} onChange={(event) => setPermanentDelete(event.target.checked)} /><span>永久删除，不进入回收站</span></label>{selectedSessions.slice(0, 8).map((session) => <div key={session.id}><strong>{session.name}</strong><span>{session.projectPath || "未标记项目"}</span></div>)}{selectedSessions.length > 8 ? <p>另有 {selectedSessions.length - 8} 个会话</p> : null}</div>
    </WorkspaceModal>
    <WorkspaceModal open={confirmSync} title="同步所选会话" description="只更新会话元数据中的供应商和模型，不修改聊天正文；每个文件写入前都会备份。" onClose={() => setConfirmSync(false)} actions={<><Button onClick={() => setConfirmSync(false)}>取消</Button><Button disabled={busy} onClick={() => void syncSelected()}>{busy ? "同步中" : `同步 ${selectedSessions.length} 个会话`}</Button></>}>
      <div className="modal-confirm-copy"><strong>目标配置</strong><p>{targetConfig?.provider || "未记录"} / {targetConfig?.model || "未记录"}</p></div>
    </WorkspaceModal>
  </section>;
}
