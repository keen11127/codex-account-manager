import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowDownload20Regular,
  ArrowExport20Regular,
  DocumentText20Regular,
  Edit20Regular,
  FolderOpen20Regular,
  PlugConnected20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge } from "../../bridge";
import type { ExtensionInventory, ManagedAccount, WorkspaceImportPreview } from "../../types";
import { WorkspaceEmpty, WorkspaceHeader, WorkspaceModal, type Notify } from "./WorkspaceCommon";

export function ExtensionManager({
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
  const [inventory, setInventory] = useState<ExtensionInventory | null>(null);
  const [tab, setTab] = useState<"skills" | "mcp">("skills");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<WorkspaceImportPreview | null>(null);
  const [selectedImport, setSelectedImport] = useState<Set<string>>(new Set());
  const [noteTarget, setNoteTarget] = useState<{ kind: "skill" | "mcp"; id: string; name: string; note: string } | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setInventory(null);
      return;
    }
    setLoading(true);
    try {
      setInventory(await bridge.listExtensions(accountId));
    } catch (error) {
      notify("扩展读取失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }, [accountId, notify]);

  useEffect(() => void load(), [load]);

  const skills = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return (inventory?.skills || []).filter((item) => !normalized || `${item.name} ${item.description || ""}`.toLocaleLowerCase("zh-CN").includes(normalized));
  }, [inventory, query]);
  const mcpServers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return (inventory?.mcpServers || []).filter((item) => !normalized || `${item.name} ${item.target || ""}`.toLocaleLowerCase("zh-CN").includes(normalized));
  }, [inventory, query]);

  const install = async () => {
    if (!accountId) return;
    setBusy("install");
    try {
      const next = await bridge.installSkillZip(accountId);
      if (next) {
        setInventory(next);
        notify("Skill 已安装", "已加入当前账号并默认启用", "success");
      }
    } catch (error) {
      notify("安装失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const openImportPreview = async () => {
    if (!accountId) return;
    setBusy("import");
    try {
      const result = await bridge.previewExistingWorkspace(accountId);
      setPreview(result);
      setSelectedImport(new Set([
        ...result.skills.filter((item) => !item.exists).map((item) => `skill:${item.id}`),
        ...result.mcpServers.filter((item) => !item.exists).map((item) => `mcp:${item.name}`),
      ]));
    } catch (error) {
      notify("预览失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const importExisting = async () => {
    if (!accountId || !preview) return;
    setBusy("import");
    try {
      const result = await bridge.importExistingWorkspace(accountId, {
        skills: [...selectedImport].filter((item) => item.startsWith("skill:")).map((item) => item.slice(6)),
        mcpServers: [...selectedImport].filter((item) => item.startsWith("mcp:")).map((item) => item.slice(4)),
      });
      setInventory(result.inventory);
      notify("本机内容已导入", `${result.importedSkills} 个 Skill，${result.importedMcp} 个 MCP`, "success");
      setPreview(null);
    } catch (error) {
      notify("导入失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const checkUpdates = async () => {
    if (!accountId) return;
    setBusy("check-updates");
    try {
      const next = await bridge.checkSkillUpdates(accountId);
      setInventory(next);
      const count = next.skills.filter((item) => item.updateStatus === "available").length;
      notify("Skill 更新检查完成", count ? `${count} 个 Skill 有可用更新` : "当前已是最新状态", count ? "warning" : "success");
    } catch (error) {
      notify("更新检查失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const updateOne = async (skillId: string) => {
    if (!accountId) return;
    setBusy(`update-${skillId}`);
    try {
      setInventory(await bridge.updateSkill(accountId, skillId));
      notify("Skill 已更新", skillId, "success");
    } catch (error) {
      notify("Skill 更新失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const saveNote = async () => {
    if (!accountId || !noteTarget) return;
    setBusy("note");
    try {
      setInventory(await bridge.saveExtensionNote(accountId, noteTarget.kind, noteTarget.id, noteTarget.note));
      notify("备注已保存", noteTarget.name, "success");
      setNoteTarget(null);
    } catch (error) {
      notify("备注保存失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async () => {
    if (!accountId) return;
    setBusy("export");
    try {
      const result = await bridge.exportWorkspace(accountId);
      if (result) notify("导出完成", result.path, "success");
    } catch (error) {
      notify("导出失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="workspace-page extension-manager">
      <WorkspaceHeader
        eyebrow="SKILLS / MCP"
        title="技能和 MCP"
        description="导入、安装、启停并导出当前账号的本地扩展配置。"
        accounts={accounts}
        selectedId={accountId}
        onSelect={onSelect}
        actions={<>
          <Button icon={<ArrowClockwise20Regular />} disabled={loading} onClick={() => void load()}>刷新</Button>
          <Button icon={<ArrowClockwise20Regular />} disabled={!accountId || Boolean(busy)} onClick={() => void checkUpdates()}>检查更新</Button>
          <Button icon={<ArrowDownload20Regular />} disabled={!accountId || Boolean(busy)} onClick={() => void openImportPreview()}>导入已有</Button>
          <Button icon={<FolderOpen20Regular />} disabled={!accountId || Boolean(busy)} onClick={() => void install()}>从 ZIP 安装</Button>
          <Button icon={<ArrowExport20Regular />} disabled={!accountId || Boolean(busy)} onClick={() => void exportAll()}>导出</Button>
        </>}
      />
      {!accountId ? <WorkspaceEmpty /> : loading && !inventory ? <div className="workspace-loading"><Spinner label="正在读取扩展" /></div> : inventory ? <>
        <div className="extension-toolbar">
          <div className="workspace-tabs workspace-tabs--large" role="tablist">
            <button role="tab" aria-selected={tab === "skills"} className={tab === "skills" ? "is-active" : ""} onClick={() => setTab("skills")}>Skills <span>{inventory.skills.length}</span></button>
            <button role="tab" aria-selected={tab === "mcp"} className={tab === "mcp" ? "is-active" : ""} onClick={() => setTab("mcp")}>MCP <span>{inventory.mcpServers.length}</span></button>
          </div>
          <input className="workspace-search" value={query} placeholder="搜索名称或说明" onChange={(event) => setQuery(event.target.value)} />
        </div>

        <section className="extension-surface">
          <header><div><strong>{tab === "skills" ? "Skills" : "MCP Servers"}</strong><span>{tab === "skills" ? "通过目录移动实现无损启停" : "停用时保留完整配置，随时可恢复"}</span></div><Button size="small" icon={<FolderOpen20Regular />} onClick={() => accountId && void bridge.openToolPath(accountId, tab === "skills" ? "skills" : "config")}>打开位置</Button></header>
          <div className="extension-table">
            {tab === "skills" ? skills.map((skill) => <article key={skill.id}>
              <span className="extension-icon"><DocumentText20Regular /></span>
              <div><strong>{skill.name}</strong><span>{skill.description || "本地 Skill"}</span>{skill.note ? <small>{skill.note}</small> : null}</div>
              <span className={`status-pill ${skill.updateStatus === "available" ? "is-warning" : skill.enabled ? "is-ok" : ""}`}>{skill.updateStatus === "available" ? "有更新" : skill.enabled ? "已启用" : "已停用"}</span>
              <div className="extension-actions"><Button size="small" icon={<Edit20Regular />} aria-label={`编辑 ${skill.name} 备注`} onClick={() => setNoteTarget({ kind: "skill", id: skill.id, name: skill.name, note: skill.note || "" })} />{skill.updateStatus === "available" ? <Button size="small" disabled={busy === `update-${skill.id}`} onClick={() => void updateOne(skill.id)}>更新</Button> : null}</div>
              <button className="blue-switch" type="button" role="switch" aria-checked={skill.enabled} disabled={!skill.canToggle || busy === skill.id} onClick={async () => {
                if (!accountId) return;
                setBusy(skill.id);
                try { setInventory(await bridge.toggleSkill(accountId, skill.id, !skill.enabled)); notify(skill.enabled ? "Skill 已停用" : "Skill 已启用", skill.name, "success"); } catch (error) { notify("操作失败", error instanceof Error ? error.message : String(error), "error"); } finally { setBusy(null); }
              }}><span /></button>
            </article>) : mcpServers.map((server) => <article key={server.name}>
              <span className="extension-icon"><PlugConnected20Regular /></span>
              <div><strong>{server.name}</strong><span>{server.target || "目标由 config.toml 定义"}</span><small>{server.transport}{server.note ? ` · ${server.note}` : ""}</small></div>
              <span className={`status-pill ${server.enabled !== false ? "is-ok" : ""}`}>{server.enabled !== false ? "已启用" : "已停用"}</span>
              <Button size="small" icon={<Edit20Regular />} aria-label={`编辑 ${server.name} 备注`} onClick={() => setNoteTarget({ kind: "mcp", id: server.name, name: server.name, note: server.note || "" })} />
              <button className="blue-switch" type="button" role="switch" aria-checked={server.enabled !== false} disabled={busy === server.name} onClick={async () => {
                if (!accountId) return;
                setBusy(server.name);
                try { setInventory(await bridge.toggleMcp(accountId, server.name, server.enabled === false)); notify(server.enabled === false ? "MCP 已启用" : "MCP 已停用", server.name, "success"); } catch (error) { notify("操作失败", error instanceof Error ? error.message : String(error), "error"); } finally { setBusy(null); }
              }}><span /></button>
            </article>)}
            {(tab === "skills" ? skills : mcpServers).length === 0 ? <WorkspaceEmpty title={query ? "没有匹配结果" : `未检测到 ${tab === "skills" ? "Skill" : "MCP"}`} detail={query ? "尝试更换搜索词。" : "可使用上方导入或安装操作补充。"} /> : null}
          </div>
        </section>
      </> : null}
      <WorkspaceModal open={Boolean(preview)} title="导入现有 Skills 与 MCP" description={preview ? `来源：${preview.sourceHome}` : ""} width="wide" onClose={() => setPreview(null)} actions={<><Button onClick={() => setPreview(null)}>取消</Button><Button disabled={selectedImport.size === 0 || busy === "import"} onClick={() => void importExisting()}>{busy === "import" ? "导入中" : `导入所选 ${selectedImport.size} 项`}</Button></>}>
        {preview ? <div className="import-preview"><section><header><strong>Skills</strong><span>{preview.skills.length} 项</span></header>{preview.skills.map((item) => <label key={item.id}><input type="checkbox" disabled={item.exists} checked={!item.exists && selectedImport.has(`skill:${item.id}`)} onChange={(event) => setSelectedImport((current) => { const next = new Set(current); event.target.checked ? next.add(`skill:${item.id}`) : next.delete(`skill:${item.id}`); return next; })} /><span>{item.id}</span><small>{item.exists ? "已存在" : "可导入"}</small></label>)}</section><section><header><strong>MCP Servers</strong><span>{preview.mcpServers.length} 项</span></header>{preview.mcpServers.map((item) => <label key={item.name}><input type="checkbox" disabled={item.exists} checked={!item.exists && selectedImport.has(`mcp:${item.name}`)} onChange={(event) => setSelectedImport((current) => { const next = new Set(current); event.target.checked ? next.add(`mcp:${item.name}`) : next.delete(`mcp:${item.name}`); return next; })} /><span>{item.name}</span><small>{item.exists ? "已存在" : item.transport}</small></label>)}</section></div> : null}
      </WorkspaceModal>
      <WorkspaceModal open={Boolean(noteTarget)} title="编辑扩展备注" description="备注仅保存在当前账号本地目录。" onClose={() => setNoteTarget(null)} actions={<><Button onClick={() => setNoteTarget(null)}>取消</Button><Button disabled={busy === "note"} onClick={() => void saveNote()}>保存备注</Button></>}>
        {noteTarget ? <div className="workspace-form"><label className="workspace-form__wide"><span>{noteTarget.name}</span><textarea rows={5} value={noteTarget.note} onChange={(event) => setNoteTarget({ ...noteTarget, note: event.target.value })} /></label></div> : null}
      </WorkspaceModal>
    </section>
  );
}
