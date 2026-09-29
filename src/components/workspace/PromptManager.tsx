import { Button, Spinner } from "@fluentui/react-components";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  ArrowSync20Regular,
  Delete20Regular,
  DocumentText20Regular,
  Edit20Regular,
  FolderOpen20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge } from "../../bridge";
import type { ManagedAccount, ManagedPrompt, PromptLibrary } from "../../types";
import {
  WorkspaceEmpty,
  WorkspaceHeader,
  WorkspaceModal,
  type Notify,
} from "./WorkspaceCommon";

const blankPrompt: Partial<ManagedPrompt> = {
  title: "",
  category: "自定义",
  description: "",
  content: "",
};

export function PromptManager({
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
  const [library, setLibrary] = useState<PromptLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [category, setCategory] = useState("全部");
  const [editing, setEditing] = useState<Partial<ManagedPrompt> | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryEditing, setCategoryEditing] = useState<string | null>(null);
  const [categoryDelete, setCategoryDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setLibrary(null);
      return;
    }
    setLoading(true);
    try {
      setLibrary(await bridge.listPrompts(accountId));
    } catch (error) {
      notify("提示词读取失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }, [accountId, notify]);

  useEffect(() => void load(), [load]);

  const categories = useMemo(
    () => {
      const values = [...new Set((library?.prompts || []).map((item) => item.category))];
      values.sort((left, right) => {
        if (left === "逆向模板") return -1;
        if (right === "逆向模板") return 1;
        return left.localeCompare(right, "zh-CN");
      });
      return ["全部", ...values];
    },
    [library],
  );
  const prompts = useMemo(
    () => (library?.prompts || []).filter((item) => category === "全部" || item.category === category),
    [category, library],
  );
  const activePrompt = useMemo(
    () => library?.prompts.find((item) => library.activeIds.includes(item.id)) || null,
    [library],
  );

  const updateMode = async (mode: PromptLibrary["mode"]) => {
    if (!accountId || !library || library.mode === mode) return;
    setBusyId("mode");
    try {
      setLibrary(await bridge.setPromptMode(accountId, mode));
      notify("启用方式已更新", mode === "append" ? "启用内容将追加到原有 AGENTS.md" : "启用内容将替换当前指令文件", "success");
    } catch (error) {
      notify("切换失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (prompt: ManagedPrompt) => {
    if (!accountId || !library) return;
    const enabled = !library.activeIds.includes(prompt.id);
    setBusyId(prompt.id);
    try {
      setLibrary(await bridge.togglePrompt(accountId, prompt.id, enabled));
      notify(enabled ? "当前提示词已切换" : "提示词已停用", prompt.title, "success");
    } catch (error) {
      notify("操作失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const save = async () => {
    if (!accountId || !editing) return;
    setSaving(true);
    try {
      setLibrary(await bridge.savePrompt(accountId, editing));
      setEditing(null);
      notify("提示词已保存", editing.title, "success");
    } catch (error) {
      notify("保存失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (prompt: ManagedPrompt) => {
    if (!accountId || prompt.source === "builtin") return;
    setBusyId(prompt.id);
    try {
      setLibrary(await bridge.deletePrompt(accountId, prompt.id));
      notify("提示词已删除", prompt.title, "success");
    } catch (error) {
      notify("删除失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const importFile = async () => {
    if (!accountId) return;
    setBusyId("import");
    try {
      const next = await bridge.importPrompt(accountId);
      if (next) {
        setLibrary(next);
        notify("提示词已导入", "已加入导入分类", "success");
      }
    } catch (error) {
      notify("导入失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const syncCatalog = async () => {
    if (!accountId) return;
    setBusyId("sync");
    try {
      const result = await bridge.syncPromptCatalog(accountId);
      setLibrary(result.library);
      notify("在线模板已同步", `${result.added} 个新增，${result.updated} 个更新，${result.preserved} 个本地修改已保留`, "success");
    } catch (error) {
      notify("模板同步失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const saveCategory = async () => {
    if (!accountId || !categoryDraft.trim()) return;
    setBusyId("category");
    try {
      const next = await bridge.savePromptCategory(accountId, categoryEditing || "", categoryDraft);
      setLibrary(next);
      setCategoryEditing(null);
      setCategoryDraft("");
      notify("分类已保存", categoryDraft, "success");
    } catch (error) {
      notify("分类保存失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const removeCategory = async () => {
    if (!accountId || !categoryDelete) return;
    setBusyId("category");
    try {
      setLibrary(await bridge.deletePromptCategory(accountId, categoryDelete));
      if (category === categoryDelete) setCategory("全部");
      notify("分类已移除", "分类内模板已移入“未分类”", "success");
      setCategoryDelete(null);
    } catch (error) {
      notify("分类移除失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="workspace-page prompt-manager">
      <WorkspaceHeader
        eyebrow="PROMPT INJECTION"
        title="一键管理指令提示词"
        description="选择启用方式，再管理内置、在线或自定义的 Markdown 提示词。"
        accounts={accounts}
        selectedId={accountId}
        onSelect={onSelect}
        showAccountPicker={false}
        actions={
          <>
            <Button className="workspace-action" icon={<ArrowClockwise20Regular />} disabled={loading} onClick={() => void load()}>
              刷新
            </Button>
            <Button className="workspace-action" icon={<ArrowSync20Regular />} disabled={!accountId || Boolean(busyId)} onClick={() => void syncCatalog()}>
              同步模板
            </Button>
            <Button className="workspace-action" icon={<Settings20Regular />} disabled={!accountId} onClick={() => setCategoriesOpen(true)}>
              分类管理
            </Button>
            <Button className="workspace-action" icon={<FolderOpen20Regular />} disabled={!accountId || busyId === "import"} onClick={() => void importFile()}>
              导入 Markdown
            </Button>
            <Button className="workspace-action workspace-action--primary" icon={<Add20Regular />} disabled={!accountId} onClick={() => setEditing({ ...blankPrompt })}>
              添加提示词
            </Button>
          </>
        }
      />

      {!accountId ? <WorkspaceEmpty /> : loading && !library ? (
        <div className="workspace-loading"><Spinner label="正在读取提示词" /></div>
      ) : library ? (
        <>
          <section className="prompt-status-strip">
            <div className="prompt-status-copy">
              <span className={`status-dot${activePrompt ? "" : " is-idle"}`} />
              <div>
                <strong>{activePrompt ? <>正在使用 <b>{activePrompt.title}</b></> : "当前未启用提示词"}</strong>
                <small><span>{library.mode === "append" ? "追加模式" : "独立文件模式"}</span><code title={library.instructionsPath}>{library.instructionsPath}</code></small>
              </div>
            </div>
            <div className="prompt-mode-control">
              <span>启用方式</span>
              <div className="segmented-control" aria-label="提示词启用方式">
                <button className={library.mode === "append" ? "is-selected" : ""} disabled={busyId === "mode"} onClick={() => void updateMode("append")}>追加到 AGENTS.md</button>
                <button className={library.mode === "replace" ? "is-selected" : ""} disabled={busyId === "mode"} onClick={() => void updateMode("replace")}>使用独立指令文件</button>
              </div>
            </div>
          </section>

          <div className="workspace-tabs" role="tablist" aria-label="提示词分类">
            {categories.map((item) => (
              <button key={item} type="button" role="tab" aria-selected={category === item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>
                {item}<span>{item === "全部" ? library.prompts.length : library.prompts.filter((prompt) => prompt.category === item).length}</span>
              </button>
            ))}
          </div>

          <div className="prompt-grid">
            {prompts.map((prompt) => {
              const active = library.activeIds.includes(prompt.id);
              return (
                <article className={`prompt-card${active ? " is-active" : ""}`} key={prompt.id}>
                  <header>
                    <span className="prompt-card__icon"><DocumentText20Regular /></span>
                    <div><strong>{prompt.title}</strong><small>{prompt.category} · {prompt.source === "builtin" ? "内置" : prompt.source === "remote" ? "在线" : "自定义"}</small></div>
                    <div className="prompt-card__controls">
                      <Button className="prompt-card__icon-button" size="small" appearance="subtle" icon={<Edit20Regular />} aria-label={`编辑 ${prompt.title}`} title="编辑提示词" onClick={() => setEditing({ ...prompt })} />
                      {prompt.source !== "builtin" ? <Button className="danger-button prompt-card__icon-button" size="small" appearance="subtle" icon={<Delete20Regular />} aria-label={`删除 ${prompt.title}`} title="删除提示词" disabled={busyId === prompt.id} onClick={() => void remove(prompt)} /> : null}
                      <button className="blue-switch" type="button" role="switch" aria-checked={active} aria-label={`${active ? "停用" : "启用"} ${prompt.title}`} title={active ? "停用" : "设为当前提示词"} disabled={busyId === prompt.id} onClick={() => void toggle(prompt)}><span /></button>
                    </div>
                  </header>
                  <p>{prompt.description || "未填写说明"}</p>
                  <footer>
                    <span className={`prompt-card__state${active ? " is-active" : ""}`}>{active ? "当前启用" : "可随时启用"}</span>
                    <span className="prompt-card__updated">一次仅启用一个模板</span>
                  </footer>
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      <WorkspaceModal
        open={Boolean(editing)}
        title={editing?.id ? "编辑提示词" : "添加提示词"}
        description="保存后会更新本地模板；当前启用的模板会按所选方式立即同步。"
        width="wide"
        onClose={() => setEditing(null)}
        actions={<><Button onClick={() => setEditing(null)}>取消</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "保存中" : "保存提示词"}</Button></>}
      >
        {editing ? (
          <div className="workspace-form workspace-form--prompt">
            <label><span>名称</span><input value={editing.title || ""} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>
            <label><span>分类</span><input value={editing.category || ""} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></label>
            <label className="workspace-form__wide"><span>说明</span><input value={editing.description || ""} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
            <label className="workspace-form__wide"><span>提示词内容</span><textarea rows={15} value={editing.content || ""} onChange={(event) => setEditing({ ...editing, content: event.target.value })} /></label>
          </div>
        ) : null}
      </WorkspaceModal>

      <WorkspaceModal
        open={categoriesOpen}
        title="提示词分类管理"
        description="重命名会同步更新分类内模板；移除分类后模板会归入“未分类”。"
        width="wide"
        onClose={() => { setCategoriesOpen(false); setCategoryEditing(null); setCategoryDraft(""); }}
        actions={<Button onClick={() => setCategoriesOpen(false)}>完成</Button>}
      >
        <div className="category-manager">
          <div className="category-manager__form">
            <input value={categoryDraft} placeholder={categoryEditing ? `重命名 ${categoryEditing}` : "新分类名称"} onChange={(event) => setCategoryDraft(event.target.value)} />
            {categoryEditing ? <Button onClick={() => { setCategoryEditing(null); setCategoryDraft(""); }}>取消编辑</Button> : null}
            <Button icon={<Add20Regular />} disabled={!categoryDraft.trim() || busyId === "category"} onClick={() => void saveCategory()}>{categoryEditing ? "保存名称" : "添加分类"}</Button>
          </div>
          <div className="category-manager__list">
            {(library?.categories || []).map((item) => <div key={item}><span><strong>{item}</strong><small>{library?.prompts.filter((prompt) => prompt.category === item).length || 0} 个模板</small></span><div><Button size="small" icon={<Edit20Regular />} onClick={() => { setCategoryEditing(item); setCategoryDraft(item); }}>重命名</Button><Button className="danger-button" size="small" icon={<Delete20Regular />} onClick={() => { setCategoriesOpen(false); setCategoryDelete(item); }}>移除</Button></div></div>)}
          </div>
        </div>
      </WorkspaceModal>

      <WorkspaceModal open={Boolean(categoryDelete)} title="移除提示词分类" description="模板内容不会删除，将统一移入“未分类”。" onClose={() => { setCategoryDelete(null); setCategoriesOpen(true); }} actions={<><Button onClick={() => { setCategoryDelete(null); setCategoriesOpen(true); }}>取消</Button><Button className="danger-button" disabled={busyId === "category"} onClick={() => void removeCategory()}>确认移除</Button></>}>
        <p className="modal-confirm-copy">将移除分类“{categoryDelete}”。</p>
      </WorkspaceModal>
    </section>
  );
}
