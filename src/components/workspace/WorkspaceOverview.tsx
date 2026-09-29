import { Button, Spinner } from "@fluentui/react-components";
import {
  Apps20Regular,
  ArrowClockwise20Regular,
  CheckmarkCircle20Filled,
  ChevronRight20Regular,
  Code20Regular,
  DocumentText20Regular,
  FolderOpen20Regular,
  History20Regular,
  Key20Regular,
  PlugConnected20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge } from "../../bridge";
import type {
  AppView,
  ExtensionInventory,
  ManagedAccount,
  ManagedSession,
  ManagedTextFile,
  PromptLibrary,
  ProviderInventory,
} from "../../types";
import { WorkspaceEmpty, WorkspaceHeader, type Notify } from "./WorkspaceCommon";
import { parseWorkspaceToml } from "../../workspaceOverview";

type OverviewData = {
  config: ManagedTextFile | null;
  auth: ManagedTextFile | null;
  providers: ProviderInventory | null;
  prompts: PromptLibrary | null;
  extensions: ExtensionInventory | null;
  sessions: ManagedSession[] | null;
  warnings: string[];
};

const EMPTY_DATA: OverviewData = {
  config: null,
  auth: null,
  providers: null,
  prompts: null,
  extensions: null,
  sessions: null,
  warnings: [],
};

export function WorkspaceOverview({
  accounts,
  accountId,
  onSelect,
  notify,
  onNavigate,
}: {
  accounts: ManagedAccount[];
  accountId: string | null;
  onSelect(id: string): void;
  notify: Notify;
  onNavigate(view: AppView): void;
}) {
  const [data, setData] = useState<OverviewData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const account = accounts.find((item) => item.id === accountId) || null;

  const load = useCallback(async () => {
    if (!accountId) {
      setData(EMPTY_DATA);
      return;
    }
    setLoading(true);
    const tasks = await Promise.allSettled([
      bridge.readManagedFile(accountId, "config"),
      bridge.readManagedFile(accountId, "auth"),
      bridge.listProviders(accountId),
      bridge.listPrompts(accountId),
      bridge.listExtensions(accountId),
      bridge.listSessions(accountId),
    ]);
    const labels = ["配置文件", "登录凭据", "供应商", "提示词", "Skills/MCP", "会话"];
    const value = <T,>(index: number) => tasks[index].status === "fulfilled"
      ? (tasks[index] as PromiseFulfilledResult<T>).value
      : null;
    const warnings = tasks.flatMap((task, index) => task.status === "rejected"
      ? [`${labels[index]}：${task.reason instanceof Error ? task.reason.message : String(task.reason)}`]
      : []);
    setData({
      config: value<ManagedTextFile>(0),
      auth: value<ManagedTextFile>(1),
      providers: value<ProviderInventory>(2),
      prompts: value<PromptLibrary>(3),
      extensions: value<ExtensionInventory>(4),
      sessions: value<ManagedSession[]>(5),
      warnings,
    });
    if (warnings.length > 0) notify("工作区已部分读取", warnings[0], "warning");
    setLoading(false);
  }, [accountId, notify]);

  useEffect(() => void load(), [load]);

  const parsed = useMemo(() => parseWorkspaceToml(data.config?.content || ""), [data.config?.content]);
  const activeProvider = data.providers?.activeId === "official"
    ? data.providers.official.name
    : data.providers?.profiles.find((item) => item.id === data.providers?.activeId)?.name || parsed.provider;
  const activePrompts = data.prompts?.activeIds.length || 0;
  const enabledSkills = data.extensions?.skills.filter((item) => item.enabled).length || 0;
  const enabledMcp = data.extensions?.mcpServers.filter((item) => item.enabled !== false).length || 0;

  return <section className="workspace-page workspace-overview-page">
    <WorkspaceHeader
      eyebrow="CODEX WORKSPACE"
      title={parsed.model || "Codex 工作区概览"}
      description="集中查看当前账号的配置、供应商、提示词、登录文件与本地扩展状态。"
      accounts={accounts}
      selectedId={accountId}
      onSelect={onSelect}
      actions={<>
        <Button className="workspace-action" icon={<FolderOpen20Regular />} disabled={!accountId} onClick={() => accountId && void bridge.openToolPath(accountId, "home")}>打开目录</Button>
        <Button className="workspace-action workspace-action--primary" icon={<ArrowClockwise20Regular />} disabled={!accountId || loading} onClick={() => void load()}>{loading ? "加载中" : "重新加载"}</Button>
      </>}
    />

    {!accountId ? <WorkspaceEmpty /> : loading && !data.config ? <div className="workspace-loading"><Spinner label="正在读取 Codex 工作区" /></div> : <>
      <section className="workspace-overview-stats" aria-label="工作区状态摘要">
        <OverviewStat icon={<Code20Regular />} tone={data.config?.exists ? "green" : "amber"} label="配置文件" value={data.config?.exists ? "已找到" : "未找到"} detail="config.toml" />
        <OverviewStat icon={<PlugConnected20Regular />} tone="blue" label="供应商" value={activeProvider || "未配置"} detail={`${(data.providers?.profiles.length || 0) + (data.providers ? 1 : 0)} 个配置`} />
        <OverviewStat icon={<DocumentText20Regular />} tone={activePrompts > 0 ? "green" : "blue"} label="指令提示词" value={activePrompts > 0 ? `${activePrompts} 个已启用` : "未启用"} detail={data.prompts?.instructionsPath || "AGENTS.md"} />
        <OverviewStat icon={<Key20Regular />} tone={data.auth?.exists ? "green" : "amber"} label="登录状态" value={data.auth?.exists ? "auth.json 已找到" : "需要登录"} detail={account?.status === "connected" ? "账号在线" : "账号未连接"} />
      </section>

      {data.warnings.length > 0 ? <div className="workspace-overview-warning" role="status"><Warning20Regular /><div><strong>部分数据尚未读取</strong><span>{data.warnings.join("；")}</span></div></div> : null}

      <section className="workspace-overview-config">
        <header>
          <div><span>实时状态</span><h2>当前 Codex 配置</h2></div>
          <b className={data.config?.exists && data.auth?.exists ? "is-ready" : "is-warning"}>{data.config?.exists && data.auth?.exists ? <CheckmarkCircle20Filled /> : <Warning20Regular />}{data.config?.exists && data.auth?.exists ? "工作区已就绪" : "需要检查"}</b>
        </header>
        <dl>
          <div><dt>账号目录</dt><dd title={account?.codexHome}>{account?.codexHome || "--"}</dd></div>
          <div><dt>配置文件</dt><dd title={data.config?.path}>{data.config?.path || "--"}</dd></div>
          <div><dt>模型</dt><dd>{parsed.model || "跟随默认配置"}</dd></div>
          <div><dt>供应商</dt><dd>{activeProvider || parsed.provider || "OpenAI 官方登录"}</dd></div>
          <div><dt>指令文件</dt><dd title={parsed.instructions || data.prompts?.instructionsPath}>{parsed.instructions || data.prompts?.instructionsPath || "AGENTS.md"}</dd></div>
        </dl>
      </section>

      <section className="workspace-overview-resources" aria-label="工作区资源">
        <button type="button" onClick={() => onNavigate("extensions")}><span className="workspace-resource-icon"><Apps20Regular /></span><span><strong>{enabledSkills} 个 Skills · {enabledMcp} 个 MCP</strong><small>本地扩展与服务</small></span><ChevronRight20Regular className="workspace-resource-arrow" /></button>
        <button type="button" onClick={() => onNavigate("sessions")}><span className="workspace-resource-icon"><History20Regular /></span><span><strong>{data.sessions?.length ?? "--"} 个本地会话</strong><small>搜索、同步与导出</small></span><ChevronRight20Regular className="workspace-resource-arrow" /></button>
        <button type="button" onClick={() => onNavigate("diagnostics")}><span className="workspace-resource-icon"><CheckmarkCircle20Filled /></span><span><strong>环境诊断</strong><small>检查配置和目录状态</small></span><ChevronRight20Regular className="workspace-resource-arrow" /></button>
      </section>
    </>}
  </section>;
}

function OverviewStat({
  icon,
  tone,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  tone: "green" | "blue" | "amber";
  label: string;
  value: string;
  detail: string;
}) {
  return <article className={`workspace-overview-stat is-${tone}`}>
    <span>{icon}</span>
    <div><small>{label}</small><strong>{value}</strong><em title={detail}>{detail}</em></div>
  </article>;
}
