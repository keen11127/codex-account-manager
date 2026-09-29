import { Button, Spinner } from "@fluentui/react-components";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  ArrowDown20Regular,
  ArrowDownload20Regular,
  ArrowUp20Regular,
  CheckmarkCircle20Filled,
  Copy20Regular,
  Delete20Regular,
  Edit20Regular,
  PlugConnected20Regular,
  Save20Regular,
  ShieldCheckmark20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge } from "../../bridge";
import type {
  ManagedAccount,
  ProviderInventory,
  ProviderProfile,
  ProviderProfileInput,
  RouterStatus,
  RoutingSettings,
  ProviderTestResult,
} from "../../types";
import {
  WorkspaceEmpty,
  WorkspaceHeader,
  WorkspaceModal,
  type Notify,
} from "./WorkspaceCommon";

const blankProvider: ProviderProfileInput = {
  name: "",
  baseUrl: "",
  model: "",
  apiKey: "",
  wireApi: "responses",
  requiresOpenaiAuth: false,
  tomlConfig: "",
  notes: "",
  contextWindow: null,
  modelMappings: [],
};

const providerPresets = [
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "qwen", name: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3-coder-plus" },
  { id: "kimi", name: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2-turbo-preview" },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M2.1" },
  { id: "glm", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.7" },
  { id: "mimo", name: "小米 MiMo", baseUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2-flash" },
];

function providerToInput(provider: ProviderProfile): ProviderProfileInput {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: "",
    wireApi: provider.wireApi,
    requiresOpenaiAuth: provider.requiresOpenaiAuth,
    tomlConfig: provider.tomlConfig,
    notes: provider.notes,
    contextWindow: provider.contextWindow,
    modelMappings: provider.modelMappings,
  };
}

export function ProviderManager({
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
  const [inventory, setInventory] = useState<ProviderInventory | null>(null);
  const [routerStatus, setRouterStatus] = useState<RouterStatus | null>(null);
  const [routeDraft, setRouteDraft] = useState<RoutingSettings | null>(null);
  const [tab, setTab] = useState<"providers" | "routing">("providers");
  const [editing, setEditing] = useState<ProviderProfileInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProviderProfile | null>(null);
  const [modelTest, setModelTest] = useState<{ provider: ProviderProfile; result: ProviderTestResult; selectedModel: string } | null>(null);
  const [contextEnabled, setContextEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) {
      setInventory(null);
      setRouterStatus(null);
      return;
    }
    setLoading(true);
    try {
      const next = await bridge.listProviders(accountId);
      setInventory(next);
      setRouteDraft(next.routing);
      setRouterStatus(await bridge.getRouterStatus(accountId));
      const config = await bridge.readManagedFile(accountId, "config");
      setContextEnabled(/^\s*model_context_window\s*=\s*1000000\s*$/m.test(config.content));
    } catch (error) {
      notify("供应商读取失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }, [accountId, notify]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!accountId || tab !== "routing") return;
    const timer = window.setInterval(() => {
      void bridge.getRouterStatus(accountId).then(setRouterStatus).catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [accountId, tab]);

  const run = async (id: string, action: () => Promise<ProviderInventory>, success: string) => {
    setBusyId(id);
    try {
      const next = await action();
      setInventory(next);
      setRouteDraft(next.routing);
      notify(success, undefined, "success");
    } catch (error) {
      notify("操作失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const saveProvider = async () => {
    if (!accountId || !editing) return;
    await run("save", () => bridge.saveProvider(accountId, editing), "供应商配置已保存");
    setEditing(null);
  };

  const test = async (provider: ProviderProfile) => {
    if (!accountId) return;
    setBusyId(`test-${provider.id}`);
    try {
      const result = await bridge.testProvider(accountId, provider.id);
      notify(
        result.ok ? "连接正常" : "连接检测未通过",
        `${result.message} · ${result.elapsedMs} ms${result.models.length ? ` · ${result.models.length} 个模型` : ""}`,
        result.ok ? "success" : "warning",
      );
      if (result.models.length > 0) setModelTest({ provider, result, selectedModel: result.models.includes(provider.model) ? provider.model : result.models[0] });
    } catch (error) {
      notify("连接测试失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const testSelectedModel = async () => {
    if (!accountId || !modelTest?.selectedModel) return;
    setBusyId(`model-${modelTest.provider.id}`);
    try {
      const result = await bridge.testProvider(accountId, modelTest.provider.id, modelTest.selectedModel);
      setModelTest({ ...modelTest, result });
      notify(result.ok ? "模型测试通过" : "模型测试未通过", result.message, result.ok ? "success" : "warning");
    } catch (error) {
      notify("模型测试失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const useSelectedModel = () => {
    if (!modelTest) return;
    setEditing({ ...providerToInput(modelTest.provider), model: modelTest.selectedModel });
    setModelTest(null);
  };

  const importDatabase = async () => {
    if (!accountId) return;
    setBusyId("import-database");
    try {
      const result = await bridge.importProviderDatabase(accountId);
      if (!result) return;
      setInventory(result.inventory);
      setRouteDraft(result.inventory.routing);
      notify("Provider 导入完成", `${result.added} 个新增，${result.updated} 个更新，${result.merged} 个合并，${result.skipped} 个跳过`, "success");
    } catch (error) {
      notify("Provider 导入失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const toggleContextWindow = async () => {
    if (!accountId) return;
    setBusyId("context-window");
    try {
      const result = await bridge.setContextWindow(accountId, !contextEnabled);
      setContextEnabled(result.enabled);
      notify(result.enabled ? "1M 上下文已开启" : "1M 上下文已关闭", "新会话会使用更新后的配置", "success");
    } catch (error) {
      notify("上下文设置失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const saveRoute = async () => {
    if (!accountId || !routeDraft) return;
    setBusyId("routing");
    try {
      const next = await bridge.saveRouting(accountId, routeDraft);
      setInventory(next);
      setRouteDraft(next.routing);
      setRouterStatus(await bridge.getRouterStatus(accountId));
      notify("路由设置已保存", next.routing.enabled ? "本地路由状态已更新" : "已恢复直接连接", "success");
    } catch (error) {
      notify("路由保存失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const resetHealth = async (providerId: string) => {
    if (!accountId) return;
    setBusyId(`health-${providerId}`);
    try {
      setRouterStatus(await bridge.resetRouterHealth(accountId, providerId));
      notify("线路健康状态已重置", undefined, "success");
    } catch (error) {
      notify("状态重置失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const routeProviders = useMemo(
    () => (routeDraft?.providerIds || []).map((id) => inventory?.profiles.find((item) => item.id === id)).filter((item): item is ProviderProfile => Boolean(item)),
    [inventory, routeDraft],
  );

  return (
    <section className="workspace-page provider-manager">
      <WorkspaceHeader
        eyebrow="PROVIDERS"
        title="供应商与路由"
        description="管理官方登录和第三方 API，可测试连接、切换配置并设置本地故障转移。"
        accounts={accounts}
        selectedId={accountId}
        onSelect={onSelect}
        actions={
          <>
            <Button icon={<ArrowClockwise20Regular />} disabled={loading} onClick={() => void load()}>刷新</Button>
            {tab === "providers" ? <><Button icon={<ArrowDownload20Regular />} disabled={!accountId || Boolean(busyId)} onClick={() => void importDatabase()}>导入 Provider</Button><Button icon={<Add20Regular />} disabled={!accountId} onClick={() => setEditing({ ...blankProvider })}>添加供应商</Button></> : <Button icon={<Save20Regular />} disabled={!routeDraft || busyId === "routing"} onClick={() => void saveRoute()}>保存路由</Button>}
          </>
        }
      />
      {!accountId ? <WorkspaceEmpty /> : loading && !inventory ? <div className="workspace-loading"><Spinner label="正在读取供应商" /></div> : inventory ? (
        <>
          <div className="workspace-tabs workspace-tabs--large" role="tablist">
            <button role="tab" aria-selected={tab === "providers"} className={tab === "providers" ? "is-active" : ""} onClick={() => setTab("providers")}>供应商配置 <span>{inventory.profiles.length + 1}</span></button>
            <button role="tab" aria-selected={tab === "routing"} className={tab === "routing" ? "is-active" : ""} onClick={() => setTab("routing")}>路由与故障转移 <span>{routerStatus?.running ? "运行中" : "已停止"}</span></button>
          </div>

          {tab === "providers" ? (
            <section className="provider-list-surface">
              <article className={`provider-row${inventory.official.active ? " is-active" : ""}`}>
                <span className="provider-row__icon"><ShieldCheckmark20Regular /></span>
                <div className="provider-row__copy"><strong>{inventory.official.name}</strong><span>{inventory.official.authReady ? "登录文件可用" : "需要重新登录"}</span></div>
                <span className={`status-pill ${inventory.official.authReady ? "is-ok" : "is-warning"}`}>{inventory.official.authReady ? "已登录" : "未登录"}</span>
                <div className="provider-row__actions">
                  <Button size="small" disabled={busyId === "context-window"} onClick={() => void toggleContextWindow()}>{contextEnabled ? "关闭 1M 上下文" : "开启 1M 上下文"}</Button>
                  {inventory.official.active ? <span className="active-provider-label"><CheckmarkCircle20Filled />当前使用</span> : <Button size="small" disabled={busyId === "official"} onClick={() => void run("official", () => bridge.activateProvider(accountId, "official"), "已切换到官方登录")}>启用</Button>}
                </div>
              </article>
              {inventory.profiles.map((provider) => (
                <article className={`provider-row${provider.active ? " is-active" : ""}`} key={provider.id}>
                  <span className="provider-row__icon"><PlugConnected20Regular /></span>
                  <div className="provider-row__copy"><strong>{provider.name}</strong><span>{provider.baseUrl}</span><small>{provider.model} · {provider.wireApi} · {provider.apiKeySet ? provider.apiKeyHint : "未保存密钥"}{provider.contextWindow === 1_000_000 ? " · 1M 上下文" : ""}</small>{provider.notes ? <small>{provider.notes}</small> : null}</div>
                  <span className={`status-pill ${provider.apiKeySet ? "is-ok" : "is-warning"}`}>{provider.apiKeySet ? "配置完整" : "待补充"}</span>
                  <div className="provider-row__actions">
                    <Button size="small" disabled={busyId === `test-${provider.id}`} onClick={() => void test(provider)}>测试</Button>
                    {provider.active ? <span className="active-provider-label"><CheckmarkCircle20Filled />当前使用</span> : <Button size="small" disabled={busyId === provider.id} onClick={() => void run(provider.id, () => bridge.activateProvider(accountId, provider.id), `已启用 ${provider.name}`)}>启用</Button>}
                    <Button size="small" icon={<Copy20Regular />} aria-label={`复制 ${provider.name}`} onClick={() => void run(`copy-${provider.id}`, () => bridge.duplicateProvider(accountId, provider.id), "供应商副本已创建")} />
                    <Button size="small" icon={<Edit20Regular />} aria-label={`编辑 ${provider.name}`} onClick={() => setEditing(providerToInput(provider))} />
                    <Button className="danger-button" size="small" icon={<Delete20Regular />} aria-label={`删除 ${provider.name}`} disabled={provider.active} onClick={() => setDeleteTarget(provider)} />
                  </div>
                </article>
              ))}
              {inventory.profiles.length === 0 ? <div className="workspace-empty workspace-empty--inside"><strong>还没有第三方供应商</strong><span>添加后可先测试连接，再启用或加入故障转移队列。</span></div> : null}
            </section>
          ) : routeDraft ? (
            <div className="routing-layout">
              <section className="routing-panel">
                <header><div><h2>本地路由</h2><p>应用运行期间代理 Codex 请求；完全退出时自动恢复直接连接。</p></div><span className={`status-pill ${routerStatus?.running ? "is-ok" : ""}`}>{routerStatus?.running ? "运行中" : "已停止"}</span></header>
                <div className="settings-list">
                  <ToggleRow title="路由总开关" detail="启动本地 HTTP 路由服务。" checked={routeDraft.enabled} onChange={(enabled) => setRouteDraft({ ...routeDraft, enabled, takeover: enabled ? routeDraft.takeover : false })} />
                  <ToggleRow title="为 Codex 启用路由" detail="把当前账号的配置切换到本地路由；关闭后恢复原配置。" checked={routeDraft.takeover} disabled={!routeDraft.enabled} onChange={(takeover) => setRouteDraft({ ...routeDraft, takeover })} />
                  <ToggleRow title="自动故障转移" detail="按队列顺序尝试供应商，错误时切换到下一条线路。" checked={routeDraft.autoFailover} disabled={!routeDraft.enabled || !routeDraft.takeover} onChange={(autoFailover) => setRouteDraft({ ...routeDraft, autoFailover })} />
                </div>
                <div className="routing-address-grid">
                  <label><span>监听地址</span><input value={routeDraft.listenAddress} disabled={routerStatus?.running} onChange={(event) => setRouteDraft({ ...routeDraft, listenAddress: event.target.value })} /></label>
                  <label><span>监听端口</span><input type="number" min={1024} max={65535} value={routeDraft.listenPort} disabled={routerStatus?.running} onChange={(event) => setRouteDraft({ ...routeDraft, listenPort: Number(event.target.value) })} /></label>
                </div>
              </section>

              <section className="routing-panel">
                <header><div><h2>优先级队列</h2><p>第一项是 P1，最多可配置 64 个供应商。</p></div><span>{routeProviders.length} 条线路</span></header>
                <div className="routing-queue">
                  {routeProviders.map((provider, index) => {
                    const health = routerStatus?.runtime.providers.find((item) => item.id === provider.id);
                    return <div className="routing-queue__row" key={provider.id}>
                      <b>P{index + 1}</b><div><strong>{provider.name}</strong><small>{provider.baseUrl}{health ? ` · 错误率 ${health.errorRate}%` : ""}</small></div><span className={`status-pill ${health?.state === "closed" ? "is-ok" : health?.state === "open" ? "is-error" : "is-warning"}`}>{health?.state === "open" ? `暂停 ${health.cooldownSeconds}s` : health?.state === "half_open" ? "试探恢复" : "正常"}</span>
                      <div>{health && (health.failedRequests > 0 || health.state !== "closed") ? <Button size="small" disabled={busyId === `health-${provider.id}`} onClick={() => void resetHealth(provider.id)}>重置状态</Button> : null}<Button size="small" icon={<ArrowUp20Regular />} aria-label="上移" disabled={index === 0} onClick={() => setRouteDraft({ ...routeDraft, providerIds: move(routeDraft.providerIds, index, index - 1) })} /><Button size="small" icon={<ArrowDown20Regular />} aria-label="下移" disabled={index === routeProviders.length - 1} onClick={() => setRouteDraft({ ...routeDraft, providerIds: move(routeDraft.providerIds, index, index + 1) })} /><Button size="small" icon={<Delete20Regular />} aria-label="移出队列" onClick={() => setRouteDraft({ ...routeDraft, providerIds: routeDraft.providerIds.filter((id) => id !== provider.id) })} /></div>
                    </div>;
                  })}
                  {routeProviders.length === 0 ? <div className="workspace-empty workspace-empty--inside"><strong>队列为空</strong><span>从下方添加至少一个供应商。</span></div> : null}
                </div>
                <div className="routing-candidates">
                  {inventory.profiles.filter((provider) => !routeDraft.providerIds.includes(provider.id)).map((provider) => <button key={provider.id} onClick={() => setRouteDraft({ ...routeDraft, providerIds: [...routeDraft.providerIds, provider.id] })}><span><strong>{provider.name}</strong><small>{provider.model}</small></span><Add20Regular /></button>)}
                </div>
              </section>

              <section className="routing-panel routing-panel--tuning">
                <header><div><h2>重试、超时与恢复</h2><p>用于限制单次请求的等待时间和熔断恢复节奏。</p></div></header>
                <div className="routing-tuning-grid">
                  <NumberField label="最大重试" value={routeDraft.maxRetries} min={0} max={10} onChange={(maxRetries) => setRouteDraft({ ...routeDraft, maxRetries })} />
                  <NumberField label="首字节超时（秒）" value={routeDraft.firstByteTimeout} min={1} max={120} onChange={(firstByteTimeout) => setRouteDraft({ ...routeDraft, firstByteTimeout })} />
                  <NumberField label="流式静默超时（秒）" value={routeDraft.idleTimeout} min={0} max={600} onChange={(idleTimeout) => setRouteDraft({ ...routeDraft, idleTimeout })} />
                  <NumberField label="请求总超时（秒）" value={routeDraft.requestTimeout} min={60} max={1200} onChange={(requestTimeout) => setRouteDraft({ ...routeDraft, requestTimeout })} />
                  <NumberField label="连续失败阈值" value={routeDraft.failureThreshold} min={1} max={20} onChange={(failureThreshold) => setRouteDraft({ ...routeDraft, failureThreshold })} />
                  <NumberField label="恢复成功阈值" value={routeDraft.successThreshold} min={1} max={20} onChange={(successThreshold) => setRouteDraft({ ...routeDraft, successThreshold })} />
                  <NumberField label="错误率阈值（%）" value={routeDraft.errorRateThreshold} min={1} max={100} onChange={(errorRateThreshold) => setRouteDraft({ ...routeDraft, errorRateThreshold })} />
                  <NumberField label="最小请求数" value={routeDraft.minimumRequests} min={1} max={100} onChange={(minimumRequests) => setRouteDraft({ ...routeDraft, minimumRequests })} />
                  <NumberField label="恢复等待（秒）" value={routeDraft.recoverySeconds} min={0} max={300} onChange={(recoverySeconds) => setRouteDraft({ ...routeDraft, recoverySeconds })} />
                </div>
              </section>

              <section className="routing-runtime">
                <div><span>处理请求</span><strong>{routerStatus?.runtime.requestCount || 0}</strong></div><div><span>成功</span><strong>{routerStatus?.runtime.successCount || 0}</strong></div><div><span>失败</span><strong>{routerStatus?.runtime.failureCount || 0}</strong></div><div><span>自动切换</span><strong>{routerStatus?.runtime.failoverCount || 0}</strong></div><div><span>正在处理</span><strong>{routerStatus?.runtime.inFlight || 0}</strong></div>
              </section>
            </div>
          ) : null}
        </>
      ) : null}

      <WorkspaceModal open={Boolean(editing)} title={editing?.id ? "编辑供应商" : "添加供应商"} description="密钥仅保存在当前账号的 D 盘本地目录，列表页只显示脱敏状态。" width="wide" onClose={() => setEditing(null)} actions={<><Button onClick={() => setEditing(null)}>取消</Button><Button disabled={busyId === "save"} onClick={() => void saveProvider()}>{busyId === "save" ? "保存中" : "保存配置"}</Button></>}>
        {editing ? <div className="workspace-form provider-form">
          <label><span>快速预设</span><select defaultValue="" onChange={(event) => { const preset = providerPresets.find((item) => item.id === event.target.value); if (preset) setEditing({ ...editing, name: editing.name || preset.name, baseUrl: preset.baseUrl, model: preset.model, wireApi: "responses" }); }}><option value="">手动配置</option>{providerPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
          <label><span>名称</span><input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
          <label><span>模型</span><input value={editing.model} onChange={(event) => setEditing({ ...editing, model: event.target.value })} /></label>
          <label className="workspace-form__wide"><span>API 地址</span><input placeholder="https://example.com/v1" value={editing.baseUrl} onChange={(event) => setEditing({ ...editing, baseUrl: event.target.value })} /></label>
          <label className="workspace-form__wide"><span>API Key {editing.id ? "（留空保留原值）" : ""}</span><input type="password" autoComplete="off" value={editing.apiKey || ""} onChange={(event) => setEditing({ ...editing, apiKey: event.target.value })} /></label>
          <label><span>Wire API</span><select value={editing.wireApi} onChange={(event) => setEditing({ ...editing, wireApi: event.target.value as ProviderProfileInput["wireApi"] })}><option value="responses">responses</option><option value="chat_completions">chat_completions</option></select></label>
          <label className="checkbox-field"><input type="checkbox" checked={editing.requiresOpenaiAuth} onChange={(event) => setEditing({ ...editing, requiresOpenaiAuth: event.target.checked })} /><span>需要 OpenAI Auth</span></label>
          <label className="checkbox-field"><input type="checkbox" checked={editing.contextWindow === 1_000_000} onChange={(event) => setEditing({ ...editing, contextWindow: event.target.checked ? 1_000_000 : null })} /><span>开启 1M 上下文窗口</span></label>
          <label className="workspace-form__wide"><span>备注</span><input value={editing.notes || ""} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
          <div className="workspace-form__wide model-mapping-editor">
            <header><span><strong>模型菜单映射</strong><small>为第三方模型设置 Codex 菜单名称和上下文窗口，默认模型会自动包含。</small></span><Button size="small" icon={<Add20Regular />} onClick={() => setEditing({ ...editing, modelMappings: [...(editing.modelMappings || []), { model: "", displayName: "", contextWindow: null }] })}>添加模型</Button></header>
            {(editing.modelMappings || []).map((mapping, index) => <div className="model-mapping-row" key={`${index}-${mapping.model}`}><input placeholder="模型 ID" value={mapping.model} onChange={(event) => setEditing({ ...editing, modelMappings: (editing.modelMappings || []).map((item, itemIndex) => itemIndex === index ? { ...item, model: event.target.value } : item) })} /><input placeholder="显示名称" value={mapping.displayName} onChange={(event) => setEditing({ ...editing, modelMappings: (editing.modelMappings || []).map((item, itemIndex) => itemIndex === index ? { ...item, displayName: event.target.value } : item) })} /><input type="number" min={1} max={10000000} placeholder="上下文窗口" value={mapping.contextWindow || ""} onChange={(event) => setEditing({ ...editing, modelMappings: (editing.modelMappings || []).map((item, itemIndex) => itemIndex === index ? { ...item, contextWindow: event.target.value ? Number(event.target.value) : null } : item) })} /><Button size="small" icon={<Delete20Regular />} aria-label="移除模型映射" onClick={() => setEditing({ ...editing, modelMappings: (editing.modelMappings || []).filter((_, itemIndex) => itemIndex !== index) })} /></div>)}
          </div>
          <label className="workspace-form__wide"><span>完整 TOML（可选）</span><textarea rows={9} value={editing.tomlConfig || ""} onChange={(event) => setEditing({ ...editing, tomlConfig: event.target.value })} /></label>
        </div> : null}
      </WorkspaceModal>

      <WorkspaceModal open={Boolean(modelTest)} title="模型获取与测试" description="从 Provider 的模型列表中选择一个模型，可先执行最小请求测试，再写入配置。" width="wide" onClose={() => setModelTest(null)} actions={<><Button onClick={() => setModelTest(null)}>关闭</Button><Button disabled={!modelTest?.selectedModel} onClick={useSelectedModel}>使用所选模型</Button><Button disabled={!modelTest?.selectedModel || busyId?.startsWith("model-")} onClick={() => void testSelectedModel()}>{busyId?.startsWith("model-") ? "测试中" : "测试所选模型"}</Button></>}>
        {modelTest ? <div className="model-test-panel"><div><strong>{modelTest.provider.name}</strong><span>{modelTest.result.models.length} 个可用模型 · 列表请求 {modelTest.result.elapsedMs} ms</span></div><select size={Math.min(9, Math.max(4, modelTest.result.models.length))} value={modelTest.selectedModel} onChange={(event) => setModelTest({ ...modelTest, selectedModel: event.target.value })}>{modelTest.result.models.map((model) => <option key={model} value={model}>{model}</option>)}</select>{modelTest.result.modelTest ? <p className={modelTest.result.modelTest.ok ? "is-success" : "is-error"}>{modelTest.result.modelTest.message}</p> : null}</div> : null}
      </WorkspaceModal>

      <WorkspaceModal open={Boolean(deleteTarget)} title="删除供应商配置" description="删除只影响保存的配置，不会删除账号或会话。" onClose={() => setDeleteTarget(null)} actions={<><Button onClick={() => setDeleteTarget(null)}>取消</Button><Button className="danger-button" onClick={() => { if (!accountId || !deleteTarget) return; const target = deleteTarget; setDeleteTarget(null); void run(`delete-${target.id}`, () => bridge.deleteProvider(accountId, target.id), `已删除 ${target.name}`); }}>确认删除</Button></>}>
        <p className="modal-confirm-copy">将删除“{deleteTarget?.name}”。当前路由队列中对此配置的引用也会一并清理。</p>
      </WorkspaceModal>
    </section>
  );
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function ToggleRow({ title, detail, checked, disabled, onChange }: { title: string; detail: string; checked: boolean; disabled?: boolean; onChange(value: boolean): void }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{detail}</span></div><button className="blue-switch" type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button></div>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange(value: number): void }) {
  return <label><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>{min} - {max}</small></label>;
}
