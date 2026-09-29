import { Badge, Button, Spinner } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  Delete20Regular,
  DocumentText20Regular,
  FolderOpen20Regular,
  History20Regular,
  Open20Regular,
  Save20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge } from "../bridge";
import type {
  AppView,
  ExtensionInventory,
  ManagedAccount,
  ManagedFileKind,
  ManagedSession,
  ManagedTextFile,
} from "../types";

type ToolView = Extract<
  AppView,
  "instructions" | "config" | "extensions" | "sessions"
>;

interface WorkspaceToolsProps {
  view: ToolView;
  accounts: ManagedAccount[];
  selectedId: string | null;
  onSelect(id: string): void;
  onNotify(
    title: string,
    body?: string,
    intent?: "success" | "error" | "warning" | "info",
  ): void;
}

const viewCopy = {
  instructions: {
    eyebrow: "AGENTS.MD",
    title: "指令提示词",
    status: "账号级全局指令",
  },
  config: {
    eyebrow: "CONFIG.TOML",
    title: "Codex 配置",
    status: "Provider、模型与 MCP 配置",
  },
  extensions: {
    eyebrow: "SKILLS / MCP",
    title: "技能和 MCP",
    status: "当前账号的本地扩展",
  },
  sessions: {
    eyebrow: "SESSIONS",
    title: "会话管理",
    status: "当前账号的本地会话",
  },
} as const;

function formatDate(value: string | null) {
  if (!value) return "尚未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ToolHeader({
  view,
  accounts,
  selectedId,
  onSelect,
}: {
  view: ToolView;
  accounts: ManagedAccount[];
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  const copy = viewCopy[view];
  return (
    <header className="tool-page__header">
      <div className="tool-page__heading">
        <span>{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <small>{copy.status}</small>
      </div>
      <div className="tool-page__controls">
        <label className="account-picker">
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
        </label>
      </div>
    </header>
  );
}

function FileEditor({
  kind,
  accountId,
  notify,
}: {
  kind: ManagedFileKind;
  accountId: string | null;
  notify: WorkspaceToolsProps["onNotify"];
}) {
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
      const next = await bridge.readManagedFile(accountId, kind);
      setFile(next);
      setDraft(next.content);
    } catch (error) {
      notify(
        "读取失败",
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, kind, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!accountId || saving) return;
    setSaving(true);
    try {
      const next = await bridge.writeManagedFile(accountId, kind, draft);
      setFile(next);
      notify(
        "保存成功",
        next.backupPath ? "原文件已自动备份" : "配置文件已创建",
        "success",
      );
    } catch (error) {
      notify(
        "保存失败",
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!accountId) {
    return <div className="tool-empty">请先在账号页添加账号</div>;
  }

  return (
    <section
      className="editor-surface"
      aria-label={kind === "instructions" ? "指令编辑器" : "配置编辑器"}
    >
      <div className="editor-surface__toolbar">
        <div>
          <strong>
            {file?.path ||
              (kind === "instructions" ? "AGENTS.md" : "config.toml")}
          </strong>
          <span>
            {file?.exists
              ? `最近保存 ${formatDate(file.updatedAt)}`
              : "文件尚未创建"}
            {file && file.content !== draft ? " · 有未保存修改" : ""}
          </span>
        </div>
        <div>
          <Button
            appearance="subtle"
            size="small"
            icon={<FolderOpen20Regular />}
            aria-label="定位配置文件"
            onClick={() => void bridge.openToolPath(accountId, kind)}
          >
            定位文件
          </Button>
          <Button
            appearance="secondary"
            size="small"
            icon={
              loading ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />
            }
            aria-label="重新读取配置文件"
            disabled={loading || saving}
            onClick={() => void load()}
          >
            重新读取
          </Button>
          <Button
            appearance="primary"
            size="small"
            icon={saving ? <Spinner size="tiny" /> : <Save20Regular />}
            aria-label="保存配置文件"
            disabled={loading || saving || !file || file.content === draft}
            onClick={() => void save()}
          >
            保存
          </Button>
        </div>
      </div>
      {loading && !file ? (
        <div className="tool-loading">
          <Spinner label="正在读取" />
        </div>
      ) : (
        <textarea
          className="tool-editor"
          value={draft}
          spellCheck={false}
          aria-label={
            kind === "instructions" ? "AGENTS.md 内容" : "config.toml 内容"
          }
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      <footer className="editor-surface__footer">
        <span>{draft.length.toLocaleString("zh-CN")} 个字符</span>
        <span>保存时自动保留上一版</span>
      </footer>
    </section>
  );
}

function ExtensionsPanel({
  accountId,
  notify,
}: {
  accountId: string | null;
  notify: WorkspaceToolsProps["onNotify"];
}) {
  const [inventory, setInventory] = useState<ExtensionInventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [busySkillId, setBusySkillId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setInventory(null);
      return;
    }
    setLoading(true);
    try {
      setInventory(await bridge.listExtensions(accountId));
    } catch (error) {
      notify(
        "读取扩展失败",
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeSkill = async (skillId: string, enabled: boolean) => {
    if (!accountId) return;
    setBusySkillId(skillId);
    try {
      setInventory(await bridge.toggleSkill(accountId, skillId, enabled));
      notify(enabled ? "Skill 已启用" : "Skill 已停用", skillId, "success");
    } catch (error) {
      notify(
        "Skill 状态更新失败",
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setBusySkillId(null);
    }
  };

  if (!accountId) return <div className="tool-empty">请先在账号页添加账号</div>;

  return (
    <div className="extension-layout">
      <section className="tool-section">
        <div className="tool-section__heading">
          <div>
            <h2>Skills</h2>
            <span>{inventory?.skills.length || 0} 项</span>
          </div>
          <div>
            <Button
              appearance="subtle"
              size="small"
              icon={<FolderOpen20Regular />}
              aria-label="打开 Skills 目录"
              onClick={() => void bridge.openToolPath(accountId, "skills")}
            >
              打开目录
            </Button>
            <Button
              appearance="secondary"
              size="small"
              icon={
                loading ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />
              }
              aria-label="刷新 Skills 和 MCP"
              disabled={loading}
              onClick={() => void load()}
            >
              刷新
            </Button>
          </div>
        </div>
        {loading && !inventory ? (
          <div className="tool-loading">
            <Spinner label="正在读取 Skills" />
          </div>
        ) : inventory?.skills.length ? (
          <div className="extension-list">
            {inventory.skills.map((skill) => (
              <article
                className="extension-row"
                key={`${skill.enabled}-${skill.id}`}
              >
                <span
                  className={`extension-row__icon${
                    skill.enabled ? " is-enabled" : ""
                  }`}
                >
                  <DocumentText20Regular />
                </span>
                <div className="extension-row__copy">
                  <strong>{skill.name}</strong>
                  <span>{skill.description || "本地 Skill"}</span>
                </div>
                <Badge
                  appearance="tint"
                  color={skill.enabled ? "success" : "subtle"}
                  size="small"
                >
                  {skill.enabled ? "已启用" : "已停用"}
                </Badge>
                <Button
                  appearance={skill.enabled ? "secondary" : "primary"}
                  size="small"
                  disabled={!skill.canToggle || busySkillId === skill.id}
                  icon={
                    busySkillId === skill.id ? (
                      <Spinner size="tiny" />
                    ) : undefined
                  }
                  onClick={() => void changeSkill(skill.id, !skill.enabled)}
                >
                  {skill.enabled ? "停用" : "启用"}
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="tool-empty tool-empty--compact">未检测到 Skill</div>
        )}
      </section>

      <section className="tool-section">
        <div className="tool-section__heading">
          <div>
            <h2>MCP Servers</h2>
            <span>{inventory?.mcpServers.length || 0} 项</span>
          </div>
          <Button
            appearance="secondary"
            size="small"
            icon={<Settings20Regular />}
            aria-label="定位 MCP 配置"
            onClick={() => void bridge.openToolPath(accountId, "config")}
          >
            定位配置
          </Button>
        </div>
        {inventory?.mcpServers.length ? (
          <div className="extension-list">
            {inventory.mcpServers.map((server) => (
              <article
                className="extension-row extension-row--mcp"
                key={server.name}
              >
                <span className="extension-row__icon is-enabled">
                  <Open20Regular />
                </span>
                <div className="extension-row__copy">
                  <strong>{server.name}</strong>
                  <span>{server.target || "目标由配置文件定义"}</span>
                </div>
                <Badge appearance="tint" color="informative" size="small">
                  {server.transport}
                </Badge>
              </article>
            ))}
          </div>
        ) : (
          <div className="tool-empty tool-empty--compact">
            config.toml 中没有 MCP 配置
          </div>
        )}
      </section>
    </div>
  );
}

function SessionsPanel({
  accountId,
  notify,
}: {
  accountId: string | null;
  notify: WorkspaceToolsProps["onNotify"];
}) {
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      setSessions(await bridge.listSessions(accountId));
    } catch (error) {
      notify(
        "读取会话失败",
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, notify]);

  useEffect(() => {
    setPendingDelete(null);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return sessions;
    return sessions.filter((session) =>
      [session.name, session.projectPath, session.model]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(normalized),
    );
  }, [query, sessions]);

  const remove = async (session: ManagedSession) => {
    if (!accountId || deleting) return;
    setDeleting(true);
    try {
      setSessions(await bridge.deleteSession(accountId, session.id));
      setPendingDelete(null);
      notify("会话已移入回收站", session.name, "success");
    } catch (error) {
      notify(
        "删除会话失败",
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (!accountId) return <div className="tool-empty">请先在账号页添加账号</div>;

  return (
    <section className="session-surface">
      <div className="session-toolbar">
        <div>
          <strong>{sessions.length} 个本地会话</strong>
          <span>最近更新优先</span>
        </div>
        <div>
          <input
            value={query}
            placeholder="搜索会话、项目或模型"
            aria-label="搜索会话"
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            appearance="subtle"
            size="small"
            icon={<FolderOpen20Regular />}
            aria-label="打开会话目录"
            onClick={() => void bridge.openToolPath(accountId, "sessions")}
          >
            打开目录
          </Button>
          <Button
            appearance="secondary"
            size="small"
            icon={
              loading ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />
            }
            aria-label="刷新会话"
            disabled={loading}
            onClick={() => void load()}
          >
            刷新
          </Button>
        </div>
      </div>
      {loading && sessions.length === 0 ? (
        <div className="tool-loading">
          <Spinner label="正在读取会话" />
        </div>
      ) : filtered.length ? (
        <div className="session-list">
          {filtered.map((session) => (
            <article className="session-row" key={session.id}>
              <span className="session-row__icon">
                <History20Regular />
              </span>
              <div className="session-row__copy">
                <strong>{session.projectPath || session.name}</strong>
                <span>{session.name}</span>
              </div>
              <div className="session-row__meta">
                <strong>{session.model || "模型未记录"}</strong>
                <span>
                  {formatDate(session.updatedAt)} · {formatBytes(session.sizeBytes)}
                </span>
              </div>
              <div className="session-row__actions">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<FolderOpen20Regular />}
                  aria-label={`定位会话 ${session.name}`}
                  title="定位文件"
                  onClick={() =>
                    void bridge.openSessionLocation(accountId, session.id)
                  }
                />
                {pendingDelete === session.id ? (
                  <div className="session-delete-confirm">
                    <Button
                      appearance="secondary"
                      size="small"
                      disabled={deleting}
                      aria-label={`取消删除会话 ${session.name}`}
                      onClick={() => setPendingDelete(null)}
                    >
                      取消
                    </Button>
                    <Button
                      className="danger-button"
                      appearance="primary"
                      size="small"
                      disabled={deleting}
                      icon={
                        deleting ? <Spinner size="tiny" /> : <Delete20Regular />
                      }
                      aria-label={`确认删除会话 ${session.name}`}
                      onClick={() => void remove(session)}
                    >
                      移入回收站
                    </Button>
                  </div>
                ) : (
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<Delete20Regular />}
                    aria-label={`删除会话 ${session.name}`}
                    title="删除"
                    onClick={() => setPendingDelete(session.id)}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="tool-empty">
          {query ? "没有匹配的会话" : "未检测到本地会话"}
        </div>
      )}
    </section>
  );
}

export function WorkspaceTools({
  view,
  accounts,
  selectedId,
  onSelect,
  onNotify,
}: WorkspaceToolsProps) {
  const accountId =
    selectedId && accounts.some((account) => account.id === selectedId)
      ? selectedId
      : accounts[0]?.id || null;

  return (
    <section className="tool-page" aria-label={viewCopy[view].title}>
      <ToolHeader
        view={view}
        accounts={accounts}
        selectedId={accountId}
        onSelect={onSelect}
      />
      {view === "instructions" || view === "config" ? (
        <FileEditor kind={view} accountId={accountId} notify={onNotify} />
      ) : view === "extensions" ? (
        <ExtensionsPanel accountId={accountId} notify={onNotify} />
      ) : (
        <SessionsPanel accountId={accountId} notify={onNotify} />
      )}
    </section>
  );
}
