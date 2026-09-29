const { createHash, randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const TOML = require("@iarna/toml");
const {
  listExtensions,
  listSessions,
  readManagedFile,
  resolveInside,
  writeManagedFile,
} = require("./workspace-tools.cjs");

const MANAGER_DIRECTORY = ".account-manager";
const PROMPT_MARKER_START = "<!-- ACCOUNT MANAGER PROMPTS:START -->";
const PROMPT_MARKER_END = "<!-- ACCOUNT MANAGER PROMPTS:END -->";
const PROMPT_CATALOG_URL =
  "https://raw.githubusercontent.com/keen11127/codex-account-manager/main/prompt-templates/catalog.json";
const MANAGED_PROMPT_FILE = ".account-manager/active-instructions.md";
const MANAGED_PROMPT_CONFIG_PATH = `./${MANAGED_PROMPT_FILE}`;
const INTEGRATED_PROMPT_IDS = new Set([
  "gpt5.5-unrestricted",
  "gpt5.4-unrestricted",
  "gpt5.5-jeli",
  "github-gpt-5-6-sol-unrestricted-33b86c71",
  "github-3-0-b459e1e8",
]);

function loadIntegratedPrompts() {
  const candidates = [
    path.resolve(__dirname, "..", "prompt-templates", "catalog.json"),
    path.resolve(process.resourcesPath || "", "prompt-templates", "catalog.json"),
  ];
  for (const target of candidates) {
    try {
      const catalog = JSON.parse(fs.readFileSync(target, "utf8"));
      return (Array.isArray(catalog) ? catalog : catalog?.templates || [])
        .filter((item) => INTEGRATED_PROMPT_IDS.has(item?.id))
        .map((item) => ({
          id: item.id,
          title: cleanText(item.title, 120),
          category: cleanText(item.category || "逆向模板", 60),
          description: cleanText(item.description || "", 240),
          content: String(item.content || ""),
          source: "builtin",
        }))
        .filter((item) => item.title && item.content.trim());
    } catch {
      // The application still starts with the core templates if the optional catalog is absent.
    }
  }
  return [];
}

const DEFAULT_PROMPTS = [
  {
    id: "builtin-engineering",
    title: "严谨工程执行",
    category: "软件开发",
    description: "先理解现有结构，再完成实现、验证和结果说明。",
    content:
      "# 严谨工程执行\n\n- 修改前先阅读相关代码与约束。\n- 优先复用项目现有结构和依赖。\n- 完成后运行与改动范围匹配的测试。\n- 明确说明实现结果、验证状态与遗留风险。\n",
    source: "builtin",
  },
  {
    id: "builtin-debugging",
    title: "系统化调试",
    category: "软件开发",
    description: "围绕复现、根因、修复和回归验证推进问题。",
    content:
      "# 系统化调试\n\n1. 先稳定复现问题并记录触发条件。\n2. 沿数据流和调用链定位根因。\n3. 使用最小且完整的修改修复根因。\n4. 添加回归测试并验证相关流程。\n",
    source: "builtin",
  },
  {
    id: "builtin-review",
    title: "严格代码审查",
    category: "代码审查",
    description: "优先发现行为缺陷、回归风险和测试缺口。",
    content:
      "# 严格代码审查\n\n- 先列出按严重程度排序的问题。\n- 每个问题说明触发条件、影响和具体位置。\n- 重点检查边界条件、并发、持久化和错误处理。\n- 没有发现问题时，说明仍未覆盖的测试风险。\n",
    source: "builtin",
  },
  {
    id: "builtin-writing",
    title: "清晰表达与润色",
    category: "写作辅助",
    description: "保持原意，改善结构、措辞和可读性。",
    content:
      "# 清晰表达与润色\n\n- 保留原文事实、语气与结论。\n- 删除重复表达，拆分过长句子。\n- 优先使用具体、自然、直接的措辞。\n- 输出成稿，并简要列出重要改动。\n",
    source: "builtin",
  },
  {
    id: "builtin-technical-docs",
    title: "技术文档写作",
    category: "写作辅助",
    description: "面向实际使用者组织可执行、可验证的技术文档。",
    content:
      "# 技术文档写作\n\n- 先说明目标、前置条件和适用范围。\n- 使用可复制的步骤、命令和示例。\n- 明确成功结果、失败处理和回滚方法。\n- 对未验证的行为明确标注。\n",
    source: "builtin",
  },
  ...loadIntegratedPrompts(),
];

function managerPath(codexHome, fileName) {
  return resolveInside(codexHome, MANAGER_DIRECTORY, fileName);
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(target, fallback) {
  try {
    const parsed = JSON.parse(await fsp.readFile(target, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw new Error(`本地数据读取失败：${path.basename(target)}`);
  }
}

async function writeJson(target, value) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fsp.rename(temporary, target);
}

function cleanText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizePromptState(raw) {
  const prompts = Array.isArray(raw?.prompts) ? raw.prompts : [];
  const existingIds = new Set(prompts.map((item) => item?.id));
  const defaults = DEFAULT_PROMPTS.filter((item) => !existingIds.has(item.id));
  const normalizedPrompts = [...prompts, ...defaults].map((item) => ({
    id: cleanText(item.id || randomUUID(), 120),
    title: cleanText(item.title || "未命名提示词", 120),
    category: cleanText(item.category || "自定义", 60),
    description: cleanText(item.description || "", 240),
    content: String(item.content || ""),
    source: ["builtin", "remote"].includes(item.source) ? item.source : "custom",
    remoteRevision: cleanText(item.remoteRevision || "", 120) || null,
    userEdited: Boolean(item.userEdited),
    updatedAt: item.updatedAt || new Date().toISOString(),
  }));
  const categories = Array.isArray(raw?.categories)
    ? raw.categories.map((item) => cleanText(item, 60)).filter(Boolean)
    : [];
  for (const prompt of normalizedPrompts) {
    if (!categories.includes(prompt.category)) categories.push(prompt.category);
  }
  return {
    version: 3,
    mode: raw?.mode === "replace" ? "replace" : "append",
    activeIds: Array.isArray(raw?.activeIds)
      ? raw.activeIds.filter((id) => typeof id === "string").slice(-1)
      : [],
    baseContent: typeof raw?.baseContent === "string" ? raw.baseContent : null,
    instructionRestore: raw?.instructionRestore && typeof raw.instructionRestore === "object"
      ? {
          existed: raw.instructionRestore.existed !== false,
          hadValue: Boolean(raw.instructionRestore.hadValue),
          line: typeof raw.instructionRestore.line === "string" ? raw.instructionRestore.line : null,
          content: typeof raw.instructionRestore.content === "string" ? raw.instructionRestore.content : null,
        }
      : null,
    lastSyncedAt: typeof raw?.lastSyncedAt === "string" ? raw.lastSyncedAt : null,
    prompts: normalizedPrompts,
    categories,
  };
}

async function readPromptState(codexHome) {
  const target = managerPath(codexHome, "prompt-library.json");
  const state = normalizePromptState(await readJson(target, null));
  await writeJson(target, state);
  return state;
}

function removeManagedPromptBlock(content) {
  const source = String(content || "");
  const start = source.indexOf(PROMPT_MARKER_START);
  const end = source.indexOf(PROMPT_MARKER_END);
  if (start < 0 || end < start) return source.trimEnd();
  return `${source.slice(0, start)}${source.slice(end + PROMPT_MARKER_END.length)}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function managedPromptPath(codexHome) {
  return resolveInside(codexHome, ...MANAGED_PROMPT_FILE.split("/"));
}

function rootInstructionLine(content) {
  for (const line of String(content || "").split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;
    if (/^\s*(?:model_instructions_file|"model_instructions_file")\s*=/.test(line)) {
      return line;
    }
  }
  return null;
}

function updateRootInstructionLine(content, replacement) {
  const source = String(content || "");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = /\r?\n$/.test(source);
  const lines = source ? source.split(/\r?\n/) : [];
  if (hadTrailingNewline && lines.at(-1) === "") lines.pop();
  const sectionIndex = lines.findIndex((line) => /^\s*\[/.test(line));
  const rootEnd = sectionIndex < 0 ? lines.length : sectionIndex;
  const settingIndex = lines.slice(0, rootEnd).findIndex((line) =>
    /^\s*(?:model_instructions_file|"model_instructions_file")\s*=/.test(line),
  );
  if (settingIndex >= 0) {
    if (replacement) lines[settingIndex] = replacement;
    else {
      lines.splice(settingIndex, 1);
      if (lines[settingIndex] === "" && lines[settingIndex - 1] === "") lines.splice(settingIndex, 1);
    }
  } else if (replacement) {
    const insertAt = sectionIndex < 0 ? lines.length : sectionIndex;
    if (insertAt > 0 && lines[insertAt - 1] !== "") lines.splice(insertAt, 0, "");
    const actualInsertAt = sectionIndex < 0 ? lines.length : lines.findIndex((line) => /^\s*\[/.test(line));
    lines.splice(actualInsertAt < 0 ? lines.length : actualInsertAt, 0, replacement);
    const nextIndex = lines.findIndex((line) => /^\s*\[/.test(line));
    if (nextIndex > 0 && lines[nextIndex - 1] !== "") lines.splice(nextIndex, 0, "");
  }
  const result = lines.join(newline);
  return result ? `${result}${newline}` : "";
}

async function writeManagedFileIfChanged(codexHome, kind, content) {
  const current = await readManagedFile(codexHome, kind);
  if (current.content === content) return current;
  return writeManagedFile(codexHome, kind, content);
}

async function writeActivePromptFile(codexHome, prompt) {
  const target = managedPromptPath(codexHome);
  const content = `${String(prompt.content || "").trim()}\n`;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  let current = null;
  try {
    current = await fsp.readFile(target, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (current !== content) {
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fsp.writeFile(temporary, content, "utf8");
    await fsp.rename(temporary, target);
  }
}

async function removeActivePromptFile(codexHome) {
  await fsp.rm(managedPromptPath(codexHome), { force: true });
}

async function applyInstructionSetting(codexHome, state, useManagedFile) {
  const config = await readManagedFile(codexHome, "config");
  const currentLine = rootInstructionLine(config.content);
  if (!state.instructionRestore && state.activeIds.length > 0) {
    state.instructionRestore = {
      existed: config.exists,
      hadValue: Boolean(currentLine && !currentLine.includes(MANAGED_PROMPT_CONFIG_PATH)),
      line: currentLine && !currentLine.includes(MANAGED_PROMPT_CONFIG_PATH) ? currentLine : null,
      content: config.content,
    };
  }

  if (useManagedFile) {
    const next = updateRootInstructionLine(
      config.content,
      `model_instructions_file = ${JSON.stringify(MANAGED_PROMPT_CONFIG_PATH)}`,
    );
    await writeManagedFileIfChanged(codexHome, "config", next);
    return;
  }

  if (currentLine?.includes(MANAGED_PROMPT_CONFIG_PATH)) {
    const restore = state.instructionRestore;
    const capturedContent = typeof restore?.content === "string" ? restore.content : null;
    const expectedManaged = capturedContent === null
      ? null
      : updateRootInstructionLine(
          capturedContent,
          `model_instructions_file = ${JSON.stringify(MANAGED_PROMPT_CONFIG_PATH)}`,
        );
    if (capturedContent !== null && config.content === expectedManaged) {
      if (restore.existed === false) await fsp.rm(config.path, { force: true });
      else await writeManagedFileIfChanged(codexHome, "config", capturedContent);
    } else {
      const replacement = restore?.hadValue ? restore.line : null;
      const next = updateRootInstructionLine(config.content, replacement);
      await writeManagedFileIfChanged(codexHome, "config", next);
    }
  }
}

async function applyPromptState(codexHome, state) {
  const current = await readManagedFile(codexHome, "instructions");
  const hadManagedBlock = current.content.includes(PROMPT_MARKER_START) && current.content.includes(PROMPT_MARKER_END);
  const unmanaged = removeManagedPromptBlock(current.content);
  const active = state.activeIds
    .slice(-1)
    .map((id) => state.prompts.find((item) => item.id === id))
    .filter(Boolean);
  state.activeIds = active.map((item) => item.id);

  if (state.baseContent === null) {
    state.baseContent = hadManagedBlock ? `${unmanaged}${unmanaged ? "\n" : ""}` : current.content;
  } else if (hadManagedBlock && unmanaged.trimEnd() !== state.baseContent.trimEnd()) {
    state.baseContent = `${unmanaged}${unmanaged ? "\n" : ""}`;
  } else if (!hadManagedBlock) {
    state.baseContent = current.content;
  }

  if (active.length > 0 && state.mode === "append") {
    const generated = `## ${active[0].title}\n\n${active[0].content.trim()}`;
    const block = `${PROMPT_MARKER_START}\n${generated}\n${PROMPT_MARKER_END}`;
    const base = state.baseContent || "";
    const nextContent = `${base.trimEnd()}${base.trim() ? "\n\n" : ""}${block}\n`;
    await writeManagedFileIfChanged(codexHome, "instructions", nextContent);
    await applyInstructionSetting(codexHome, state, false);
    await removeActivePromptFile(codexHome);
  } else if (active.length > 0) {
    if (hadManagedBlock) {
      await writeManagedFileIfChanged(codexHome, "instructions", state.baseContent || "");
    }
    await writeActivePromptFile(codexHome, active[0]);
    await applyInstructionSetting(codexHome, state, true);
  } else {
    if (hadManagedBlock) {
      await writeManagedFileIfChanged(codexHome, "instructions", state.baseContent || "");
    }
    await applyInstructionSetting(codexHome, state, false);
    await removeActivePromptFile(codexHome);
    state.baseContent = null;
    state.instructionRestore = null;
  }
  await writeJson(managerPath(codexHome, "prompt-library.json"), state);
  return state;
}

async function listPrompts(codexHome) {
  const state = await readPromptState(codexHome);
  return {
    mode: state.mode,
    activeIds: state.activeIds,
    prompts: state.prompts,
    categories: state.categories,
    lastSyncedAt: state.lastSyncedAt,
    instructionsPath: state.mode === "replace" && state.activeIds.length > 0
      ? managedPromptPath(codexHome)
      : resolveInside(codexHome, "AGENTS.md"),
  };
}

async function savePrompt(codexHome, input) {
  const state = await readPromptState(codexHome);
  const id = cleanText(input?.id || randomUUID(), 120);
  const title = cleanText(input?.title, 120);
  const content = String(input?.content || "").trim();
  if (!title) throw new Error("请填写提示词名称");
  if (!content) throw new Error("请填写提示词内容");
  const existing = state.prompts.find((item) => item.id === id);
  const next = {
    id,
    title,
    category: cleanText(input?.category || existing?.category || "自定义", 60),
    description: cleanText(input?.description || "", 240),
    content,
    source: existing?.source === "builtin" ? "builtin" : existing?.source === "remote" ? "remote" : "custom",
    remoteRevision: existing?.remoteRevision || null,
    userEdited: existing && ["builtin", "remote"].includes(existing.source)
      ? true
      : Boolean(existing?.userEdited),
    updatedAt: new Date().toISOString(),
  };
  if (!state.categories.includes(next.category)) state.categories.push(next.category);
  if (existing) Object.assign(existing, next);
  else state.prompts.push(next);
  if (state.activeIds.includes(id)) await applyPromptState(codexHome, state);
  else await writeJson(managerPath(codexHome, "prompt-library.json"), state);
  return listPrompts(codexHome);
}

async function deletePrompt(codexHome, id) {
  const state = await readPromptState(codexHome);
  const cleanId = cleanText(id, 120);
  state.prompts = state.prompts.filter((item) => item.id !== cleanId);
  state.activeIds = state.activeIds.filter((item) => item !== cleanId);
  await applyPromptState(codexHome, state);
  return listPrompts(codexHome);
}

async function togglePrompt(codexHome, id, enabled) {
  const state = await readPromptState(codexHome);
  const cleanId = cleanText(id, 120);
  if (!state.prompts.some((item) => item.id === cleanId)) {
    throw new Error("提示词已不存在，请刷新后重试");
  }
  state.activeIds = enabled
    ? [cleanId]
    : state.activeIds.filter((item) => item !== cleanId);
  await applyPromptState(codexHome, state);
  return listPrompts(codexHome);
}

async function setPromptMode(codexHome, mode) {
  const state = await readPromptState(codexHome);
  state.mode = mode === "replace" ? "replace" : "append";
  await applyPromptState(codexHome, state);
  return listPrompts(codexHome);
}

async function importPrompt(codexHome, filePath) {
  const stat = await fsp.stat(filePath);
  if (stat.size > 2 * 1024 * 1024) throw new Error("提示词文件超过 2 MB");
  const content = await fsp.readFile(filePath, "utf8");
  return savePrompt(codexHome, {
    title: path.basename(filePath, path.extname(filePath)),
    category: "导入",
    description: `导入自 ${path.basename(filePath)}`,
    content,
  });
}

function normalizeCatalogPrompt(item) {
  const id = cleanText(item?.id, 100).replace(/[^a-zA-Z0-9_-]+/g, "-");
  const title = cleanText(item?.title, 120);
  const content = String(item?.content || "").trim();
  if (!id || !title || !content || content.length > 512 * 1024) return null;
  const integrated = INTEGRATED_PROMPT_IDS.has(id);
  return {
    id: integrated ? id : `remote-${id}`,
    title,
    category: cleanText(item?.category || "在线模板", 60),
    description: cleanText(item?.description || "", 240),
    content,
    source: integrated ? "builtin" : "remote",
    remoteRevision: cleanText(item?.revision || item?.updatedAt || "", 120) || null,
    userEdited: false,
    updatedAt: new Date().toISOString(),
  };
}

async function syncPromptCatalog(codexHome, catalogUrl = PROMPT_CATALOG_URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let catalog;
  try {
    const response = await fetch(catalogUrl, {
      headers: { Accept: "application/json", "User-Agent": "codex-account-manager" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`模板服务返回 HTTP ${response.status}`);
    catalog = await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("模板同步超时，请稍后重试");
    throw new Error(`模板同步失败：${error?.message || error}`);
  } finally {
    clearTimeout(timeout);
  }
  const incoming = (Array.isArray(catalog) ? catalog : catalog?.templates)
    ?.slice(0, 200)
    .map(normalizeCatalogPrompt)
    .filter(Boolean) || [];
  if (incoming.length === 0) throw new Error("在线模板目录中没有可用内容");

  const state = await readPromptState(codexHome);
  let added = 0;
  let updated = 0;
  let preserved = 0;
  for (const prompt of incoming) {
    const existing = state.prompts.find((item) => item.id === prompt.id);
    if (!existing) {
      state.prompts.push(prompt);
      added += 1;
    } else if (existing.userEdited) {
      preserved += 1;
    } else if (
      existing.remoteRevision !== prompt.remoteRevision ||
      existing.content !== prompt.content ||
      existing.title !== prompt.title
    ) {
      Object.assign(existing, prompt);
      updated += 1;
    }
    if (!state.categories.includes(prompt.category)) state.categories.push(prompt.category);
  }
  state.lastSyncedAt = new Date().toISOString();
  if (state.activeIds.some((id) => incoming.some((item) => item.id === id))) {
    await applyPromptState(codexHome, state);
  } else {
    await writeJson(managerPath(codexHome, "prompt-library.json"), state);
  }
  return { library: await listPrompts(codexHome), added, updated, preserved };
}

async function savePromptCategory(codexHome, previousName, nextName) {
  const state = await readPromptState(codexHome);
  const previous = cleanText(previousName, 60);
  const next = cleanText(nextName, 60);
  if (!next) throw new Error("请填写分类名称");
  if (state.categories.some((item) => item === next && item !== previous)) {
    throw new Error("已经存在同名分类");
  }
  if (previous) {
    state.categories = state.categories.map((item) => item === previous ? next : item);
    for (const prompt of state.prompts) {
      if (prompt.category === previous) prompt.category = next;
    }
  } else if (!state.categories.includes(next)) {
    state.categories.push(next);
  }
  await writeJson(managerPath(codexHome, "prompt-library.json"), state);
  return listPrompts(codexHome);
}

async function deletePromptCategory(codexHome, name) {
  const state = await readPromptState(codexHome);
  const target = cleanText(name, 60);
  if (!target) return listPrompts(codexHome);
  const fallback = "未分类";
  for (const prompt of state.prompts) {
    if (prompt.category === target) prompt.category = fallback;
  }
  state.categories = state.categories.filter((item) => item !== target);
  if (!state.categories.includes(fallback)) state.categories.push(fallback);
  await writeJson(managerPath(codexHome, "prompt-library.json"), state);
  return listPrompts(codexHome);
}

function providerStorePath(codexHome) {
  return managerPath(codexHome, "provider-profiles.json");
}

async function readProviderState(codexHome) {
  const target = providerStorePath(codexHome);
  const raw = await readJson(target, null);
  if (raw) {
    return {
      version: 1,
      activeId: typeof raw.activeId === "string" ? raw.activeId : "official",
      officialConfig: typeof raw.officialConfig === "string" ? raw.officialConfig : null,
      profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
      routing: normalizeRouting(raw.routing),
    };
  }
  const current = await readManagedFile(codexHome, "config");
  const state = {
    version: 1,
    activeId: "official",
    officialConfig: current.content,
    profiles: [],
    routing: normalizeRouting(null),
  };
  await writeJson(target, state);
  return state;
}

function publicProvider(provider, activeId) {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    model: provider.model,
    wireApi: provider.wireApi,
    requiresOpenaiAuth: Boolean(provider.requiresOpenaiAuth),
    apiKeySet: Boolean(provider.apiKey),
    apiKeyHint: provider.apiKey
      ? `${provider.apiKey.slice(0, 3)}***${provider.apiKey.slice(-3)}`
      : null,
    tomlConfig: redactProviderToml(provider.tomlConfig || ""),
    notes: provider.notes || "",
    contextWindow: provider.contextWindow === 1_000_000 ? 1_000_000 : null,
    modelMappings: Array.isArray(provider.modelMappings) ? provider.modelMappings : [],
    active: activeId === provider.id,
    updatedAt: provider.updatedAt,
  };
}

function redactProviderToml(content) {
  return String(content || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(experimental_bearer_token|api_key)\s*=/.test(line))
    .join("\n");
}

async function listProviders(codexHome) {
  const state = await readProviderState(codexHome);
  const auth = resolveInside(codexHome, "auth.json");
  return {
    activeId: state.activeId,
    official: {
      id: "official",
      name: "OpenAI 官方登录",
      active: state.activeId === "official",
      authReady: await pathExists(auth),
    },
    profiles: state.profiles.map((item) => publicProvider(item, state.activeId)),
    routing: state.routing,
  };
}

function providerSlug(id) {
  const value = String(id || "provider")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return value || `provider-${Date.now()}`;
}

function tomlString(value) {
  return JSON.stringify(String(value || ""));
}

function buildProviderToml(provider, catalogPath = null) {
  const id = providerSlug(provider.id);
  return [
    `model = ${tomlString(provider.model)}`,
    `model_provider = ${tomlString(id)}`,
    provider.contextWindow === 1_000_000 ? "model_context_window = 1000000" : "",
    catalogPath ? `model_catalog_json = ${tomlString(catalogPath)}` : "",
    "",
    `[model_providers.${tomlString(id)}]`,
    `name = ${tomlString(provider.name)}`,
    `base_url = ${tomlString(provider.baseUrl.replace(/\/$/, ""))}`,
    `wire_api = ${tomlString(provider.wireApi || "responses")}`,
    `requires_openai_auth = ${provider.requiresOpenaiAuth ? "true" : "false"}`,
    provider.apiKey
      ? `experimental_bearer_token = ${tomlString(provider.apiKey)}`
      : "",
  ].filter(Boolean).join("\n");
}

function modelCatalogEntry(mapping, index, defaultContext) {
  const contextWindow = mapping.contextWindow || defaultContext;
  const efforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
  return {
    slug: mapping.model,
    display_name: mapping.displayName || mapping.model,
    description: mapping.displayName || mapping.model,
    base_instructions: "You are a coding assistant working with the user in a shared workspace. Use the available tools to inspect and edit project files, follow the user's requirements, and verify your changes.",
    default_reasoning_level: "high",
    supported_reasoning_levels: efforts.map((effort) => ({ effort, description: effort === "none" ? "Disable thinking" : `${effort} reasoning effort` })),
    shell_type: "shell_command",
    visibility: "list",
    supported_in_api: true,
    priority: index,
    additional_speed_tiers: [],
    service_tiers: [],
    availability_nux: null,
    upgrade: null,
    supports_reasoning_summaries: true,
    supports_reasoning_summary_parameter: false,
    default_reasoning_summary: "none",
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: null,
    truncation_policy: { mode: "bytes", limit: 10_000 },
    supports_parallel_tool_calls: false,
    supports_image_detail_original: false,
    context_window: contextWindow,
    max_context_window: contextWindow,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: ["text"],
    supports_search_tool: false,
    use_responses_lite: false,
    prefer_websockets: false,
  };
}

async function prepareModelCatalog(codexHome, provider) {
  const mappings = Array.isArray(provider.modelMappings) ? [...provider.modelMappings] : [];
  if (mappings.length === 0) return null;
  if (!mappings.some((item) => item.model === provider.model)) {
    mappings.unshift({ model: provider.model, displayName: provider.model, contextWindow: null });
  }
  const defaultContext = provider.contextWindow || 128_000;
  const catalog = {
    models: mappings.slice(0, 64).map((item, index) => modelCatalogEntry(item, index, defaultContext)),
    _account_manager_model_catalog: {
      format: 1,
      providerHash: createHash("sha256").update(provider.id).digest("hex"),
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  const name = `${createHash("sha256").update(bytes).digest("hex")}.json`;
  const directory = managerPath(codexHome, "model-catalogs");
  const target = resolveInside(directory, name);
  await fsp.mkdir(directory, { recursive: true });
  if (!(await pathExists(target))) {
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fsp.writeFile(temporary, bytes);
    await fsp.rename(temporary, target);
  }
  return target;
}

function stripProviderConfig(content) {
  const lines = String(content || "").split(/\r?\n/);
  const output = [];
  let inProviderSection = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      inProviderSection = /^model_providers(?:\.|$)/.test(header[1]);
      if (inProviderSection) continue;
    }
    if (inProviderSection) continue;
    if (/^\s*(model|model_provider|experimental_bearer_token)\s*=/.test(line)) {
      continue;
    }
    output.push(line);
  }
  return output.join("\n").replace(/^\s+|\s+$/g, "");
}

async function saveProvider(codexHome, input) {
  const state = await readProviderState(codexHome);
  const id = providerSlug(input?.id || randomUUID());
  const existing = state.profiles.find((item) => item.id === id);
  const name = cleanText(input?.name || existing?.name, 100);
  const baseUrl = cleanText(input?.baseUrl || existing?.baseUrl, 500);
  const model = cleanText(input?.model || existing?.model, 120);
  if (!name || !baseUrl || !model) throw new Error("请填写名称、API 地址和模型");
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error("API 地址格式不正确");
  }
  if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("API 地址仅支持 HTTP 或 HTTPS");
  const mappings = Array.isArray(input?.modelMappings)
    ? input.modelMappings.slice(0, 64).map((item) => ({
      model: cleanText(item?.model, 200),
      displayName: cleanText(item?.displayName || item?.model, 200),
      contextWindow: Number.isInteger(Number(item?.contextWindow)) && Number(item.contextWindow) > 0 && Number(item.contextWindow) <= 10_000_000
        ? Number(item.contextWindow)
        : null,
    })).filter((item) => item.model)
    : existing?.modelMappings || [];
  if (new Set(mappings.map((item) => item.model)).size !== mappings.length) throw new Error("模型映射中存在重复模型 ID");
  const inputToml = typeof input?.tomlConfig === "string" ? input.tomlConfig : existing?.tomlConfig || "";
  const embeddedKey = inputToml.match(/^\s*(?:experimental_bearer_token|api_key)\s*=\s*["']([^"']+)["']\s*$/m)?.[1] || "";
  const next = {
    id,
    name,
    baseUrl: parsedUrl.toString().replace(/\/$/, ""),
    model,
    apiKey: typeof input?.apiKey === "string" && input.apiKey
      ? input.apiKey.trim()
      : embeddedKey
        ? embeddedKey.trim()
      : existing?.apiKey || "",
    wireApi: ["responses", "chat_completions"].includes(input?.wireApi)
      ? input.wireApi
      : existing?.wireApi || "responses",
    requiresOpenaiAuth: Boolean(input?.requiresOpenaiAuth),
    tomlConfig: redactProviderToml(inputToml),
    notes: cleanText(input?.notes || existing?.notes || "", 500),
    contextWindow: input?.contextWindow === undefined
      ? existing?.contextWindow || null
      : Number(input.contextWindow) === 1_000_000 ? 1_000_000 : null,
    modelMappings: mappings,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, next);
  else state.profiles.push(next);
  await writeJson(providerStorePath(codexHome), state);
  return listProviders(codexHome);
}

async function duplicateProvider(codexHome, id) {
  const state = await readProviderState(codexHome);
  const source = state.profiles.find((item) => item.id === id);
  if (!source) throw new Error("供应商配置已不存在");
  const duplicate = {
    ...source,
    id: providerSlug(`${source.id}-${Date.now().toString(36)}`),
    name: `${source.name} 副本`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.profiles.push(duplicate);
  await writeJson(providerStorePath(codexHome), state);
  return listProviders(codexHome);
}

async function activateProvider(codexHome, id) {
  const state = await readProviderState(codexHome);
  const current = await readManagedFile(codexHome, "config");
  const routed = Boolean(state.routing?.directConfig);
  const directContent = routed ? state.routing.directConfig : current.content;
  let nextContent;
  if (id === "official") {
    nextContent = state.officialConfig || "";
    state.activeId = "official";
  } else {
    const provider = state.profiles.find((item) => item.id === id);
    if (!provider) throw new Error("供应商配置已不存在");
    if (state.activeId === "official") state.officialConfig = directContent;
    const catalogPath = await prepareModelCatalog(codexHome, provider);
    let providerConfig = provider.tomlConfig.trim() || buildProviderToml(provider, catalogPath);
    providerConfig = setRootTomlValue(
      providerConfig,
      "model_catalog_json",
      catalogPath ? `model_catalog_json = ${tomlString(catalogPath)}` : null,
    );
    providerConfig = setRootTomlValue(
      providerConfig,
      "experimental_bearer_token",
      provider.apiKey ? `experimental_bearer_token = ${tomlString(provider.apiKey)}` : null,
    );
    const common = stripProviderConfig(
      state.activeId === "official" ? directContent : state.officialConfig || directContent,
    );
    nextContent = `${providerConfig.trim()}${common ? `\n\n${common}` : ""}\n`;
    state.activeId = provider.id;
  }
  if (routed) state.routing.directConfig = nextContent;
  else await writeManagedFile(codexHome, "config", nextContent);
  await writeJson(providerStorePath(codexHome), state);
  return listProviders(codexHome);
}

function setRootTomlValue(content, key, valueLine) {
  const lines = String(content || "").split(/\r?\n/);
  let inRoot = true;
  let replaced = false;
  const output = [];
  for (const line of lines) {
    if (/^\s*\[/.test(line)) inRoot = false;
    if (inRoot && new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      if (!replaced && valueLine) output.push(valueLine);
      replaced = true;
      continue;
    }
    output.push(line);
  }
  if (!replaced && valueLine) {
    const firstSection = output.findIndex((line) => /^\s*\[/.test(line));
    output.splice(firstSection < 0 ? output.length : firstSection, 0, valueLine);
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

async function setContextWindow(codexHome, enabled) {
  const state = await readProviderState(codexHome);
  const current = await readManagedFile(codexHome, "config");
  const routed = Boolean(state.routing?.directConfig);
  const direct = routed ? state.routing.directConfig : current.content;
  const next = setRootTomlValue(direct, "model_context_window", enabled ? "model_context_window = 1000000" : null);
  if (routed) state.routing.directConfig = next;
  else await writeManagedFile(codexHome, "config", `${next.trimEnd()}\n`);
  const active = state.profiles.find((item) => item.id === state.activeId);
  if (active) active.contextWindow = enabled ? 1_000_000 : null;
  await writeJson(providerStorePath(codexHome), state);
  return { enabled: Boolean(enabled), file: await readManagedFile(codexHome, "config") };
}

async function deleteProvider(codexHome, id) {
  const state = await readProviderState(codexHome);
  if (state.activeId === id) throw new Error("当前正在使用该供应商，请先切换到其他配置");
  state.profiles = state.profiles.filter((item) => item.id !== id);
  state.routing.providerIds = state.routing.providerIds.filter((item) => item !== id);
  await writeJson(providerStorePath(codexHome), state);
  return listProviders(codexHome);
}

function providerModelsUrl(baseUrl) {
  const url = new URL(baseUrl);
  const pathName = url.pathname.replace(/\/$/, "");
  url.pathname = /\/v1$/i.test(pathName) ? `${pathName}/models` : `${pathName}/v1/models`;
  return url.toString();
}

function providerRequestUrl(baseUrl, wireApi) {
  const url = new URL(baseUrl);
  const pathName = url.pathname.replace(/\/$/, "");
  const endpoint = wireApi === "chat_completions" ? "chat/completions" : "responses";
  url.pathname = /\/v1$/i.test(pathName)
    ? `${pathName}/${endpoint}`
    : `${pathName}/v1/${endpoint}`.replace(/\/{2,}/g, "/");
  return url.toString();
}

async function testProvider(codexHome, id, requestedModel = null) {
  const state = await readProviderState(codexHome);
  const provider = state.profiles.find((item) => item.id === id);
  if (!provider) throw new Error("供应商配置已不存在");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(providerModelsUrl(provider.baseUrl), {
      headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;
    let models = [];
    try {
      const body = await response.json();
      models = Array.isArray(body?.data)
        ? body.data.map((item) => item?.id).filter(Boolean).slice(0, 80)
        : [];
    } catch {
      models = [];
    }
    let modelTest = null;
    const model = cleanText(requestedModel, 200);
    if (response.ok && model) {
      const payload = provider.wireApi === "chat_completions"
        ? { model, messages: [{ role: "user", content: "Reply OK" }], max_tokens: 1, stream: false }
        : { model, input: "Reply OK", max_output_tokens: 1, stream: false };
      const modelController = new AbortController();
      const modelTimeout = setTimeout(() => modelController.abort(), 20_000);
      try {
        const modelResponse = await fetch(providerRequestUrl(provider.baseUrl, provider.wireApi), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: modelController.signal,
        });
        modelTest = {
          ok: modelResponse.ok,
          status: modelResponse.status,
          message: modelResponse.ok ? `${model} 可用` : `${model} 返回 HTTP ${modelResponse.status}`,
        };
        await modelResponse.body?.cancel().catch(() => {});
      } catch (error) {
        modelTest = {
          ok: false,
          status: null,
          message: error?.name === "AbortError" ? `${model} 测试超时` : String(error?.message || error),
        };
      } finally {
        clearTimeout(modelTimeout);
      }
    }
    return {
      ok: response.ok && (!modelTest || modelTest.ok),
      status: response.status,
      elapsedMs,
      models,
      testedModel: model || null,
      modelTest,
      message: modelTest?.message || (response.ok ? "连接正常" : `服务返回 HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - startedAt,
      models: [],
      testedModel: cleanText(requestedModel, 200) || null,
      modelTest: null,
      message: error?.name === "AbortError" ? "连接超时" : String(error?.message || error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function ccSwitchCandidates(explicitPath = null) {
  if (explicitPath) return [path.resolve(explicitPath)];
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  return [
    path.join(home, ".cc-switch", "cc-switch.db"),
    path.join(home, ".cc-switch", "cc_switch.db"),
    path.join(appData, "cc-switch", "cc-switch.db"),
    path.join(appData, "CC Switch", "cc-switch.db"),
    path.join(localAppData, "cc-switch", "cc-switch.db"),
  ];
}

function providerSectionsFromToml(configText) {
  let document;
  try {
    document = TOML.parse(String(configText || ""));
  } catch {
    return [];
  }
  const providers = document?.model_providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) return [];
  const active = cleanText(document.model_provider, 120);
  const model = cleanText(document.model, 200);
  return Object.entries(providers)
    .filter(([, value]) => value && typeof value === "object" && !Array.isArray(value))
    .map(([id, value]) => ({
      id: providerSlug(id),
      sourceId: id,
      active: id === active,
      name: cleanText(value.name || id, 100),
      baseUrl: cleanText(value.base_url, 500).replace(/\/$/, ""),
      model,
      wireApi: value.wire_api === "chat_completions" ? "chat_completions" : "responses",
      requiresOpenaiAuth: Boolean(value.requires_openai_auth),
      apiKey: cleanText(value.experimental_bearer_token, 1000),
    }))
    .filter((item) => item.baseUrl && item.model);
}

async function importCcSwitchProviders(codexHome, explicitPath = null) {
  let databasePath = null;
  for (const candidate of ccSwitchCandidates(explicitPath)) {
    if (await pathExists(candidate)) {
      databasePath = candidate;
      break;
    }
  }
  if (!databasePath) throw new Error("未检测到可导入的 Provider 数据库");

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    throw new Error("当前运行环境缺少 SQLite 读取能力");
  }
  const database = new DatabaseSync(databasePath, { readOnly: true, allowExtension: false });
  let rows;
  try {
    const columns = database.prepare("PRAGMA table_info(providers)").all();
    const names = new Set(columns.map((item) => item.name));
    if (!names.has("settings_config") || !names.has("app_type")) {
      throw new Error("Provider 数据库结构不受支持");
    }
    const category = names.has("category") ? "category" : "NULL AS category";
    rows = database.prepare(
      `SELECT id, name, settings_config, ${category} FROM providers WHERE app_type = 'codex'`,
    ).all();
  } finally {
    database.close();
  }

  const state = await readProviderState(codexHome);
  let added = 0;
  let updated = 0;
  let merged = 0;
  let skipped = 0;
  const warnings = [];
  for (const row of rows) {
    if (
      String(row.id || "").toLowerCase() === "codex-official" ||
      String(row.category || "").toLowerCase() === "official"
    ) {
      skipped += 1;
      continue;
    }
    let settings;
    try {
      settings = JSON.parse(String(row.settings_config || "{}"));
    } catch {
      skipped += 1;
      warnings.push(`${row.name || row.id}：配置 JSON 格式异常`);
      continue;
    }
    const sections = providerSectionsFromToml(settings.config || "");
    const wantedId = providerSlug(row.id);
    const section = sections.find((item) => item.sourceId === row.id)
      || sections.find((item) => item.active)
      || sections.find((item) => item.sourceId === "custom")
      || sections[0];
    if (!section) {
      skipped += 1;
      warnings.push(`${row.name || row.id}：没有可用的 API 配置`);
      continue;
    }
    const apiKey = cleanText(settings?.auth?.OPENAI_API_KEY || section.apiKey, 1000);
    const duplicate = state.profiles.find((item) =>
      item.baseUrl?.replace(/\/$/, "") === section.baseUrl &&
      (item.apiKey || "") === apiKey,
    );
    const existing = state.profiles.find((item) => item.id === wantedId);
    if (duplicate && duplicate !== existing) {
      duplicate.name = cleanText(row.name || section.name || duplicate.name, 100);
      duplicate.model = section.model || duplicate.model;
      duplicate.updatedAt = new Date().toISOString();
      merged += 1;
      continue;
    }
    const next = {
      id: wantedId,
      name: cleanText(row.name || section.name || wantedId, 100),
      baseUrl: section.baseUrl,
      model: section.model,
      apiKey,
      wireApi: section.wireApi,
      requiresOpenaiAuth: section.requiresOpenaiAuth,
      tomlConfig: redactProviderToml(String(settings.config || "")),
      notes: "从本机 Provider 配置导入",
      contextWindow: Number(settings?.model_context_window) === 1_000_000 ? 1_000_000 : null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      Object.assign(existing, next);
      updated += 1;
    } else {
      state.profiles.push(next);
      added += 1;
    }
  }
  await writeJson(providerStorePath(codexHome), state);
  return {
    databasePath,
    imported: added + updated + merged,
    added,
    updated,
    merged,
    skipped,
    warnings: warnings.slice(0, 20),
    inventory: await listProviders(codexHome),
  };
}

function normalizeRouting(raw) {
  return {
    enabled: Boolean(raw?.enabled),
    takeover: Boolean(raw?.takeover),
    autoFailover: Boolean(raw?.autoFailover),
    listenAddress: cleanText(raw?.listenAddress || "127.0.0.1", 80),
    listenPort: Number.isInteger(raw?.listenPort) ? raw.listenPort : 15721,
    providerIds: Array.isArray(raw?.providerIds) ? raw.providerIds.filter((id) => typeof id === "string").slice(0, 64) : [],
    maxRetries: Number.isInteger(raw?.maxRetries) ? raw.maxRetries : 3,
    firstByteTimeout: Number.isInteger(raw?.firstByteTimeout) ? raw.firstByteTimeout : 60,
    idleTimeout: Number.isInteger(raw?.idleTimeout) ? raw.idleTimeout : 120,
    requestTimeout: Number.isInteger(raw?.requestTimeout) ? raw.requestTimeout : 600,
    failureThreshold: Number.isInteger(raw?.failureThreshold) ? raw.failureThreshold : 4,
    successThreshold: Number.isInteger(raw?.successThreshold) ? raw.successThreshold : 2,
    errorRateThreshold: Number.isFinite(raw?.errorRateThreshold) ? Number(raw.errorRateThreshold) : 60,
    minimumRequests: Number.isInteger(raw?.minimumRequests) ? raw.minimumRequests : 5,
    recoverySeconds: Number.isInteger(raw?.recoverySeconds) ? raw.recoverySeconds : 60,
    routeToken: typeof raw?.routeToken === "string" && raw.routeToken
      ? raw.routeToken
      : randomUUID(),
    directConfig: typeof raw?.directConfig === "string" ? raw.directConfig : null,
  };
}

function validateRouting(routing, providerIds) {
  if (!/^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[?[0-9a-f:]+\]?)$/i.test(routing.listenAddress)) {
    throw new Error("监听地址格式不正确");
  }
  if (routing.listenPort < 1024 || routing.listenPort > 65535) throw new Error("监听端口须为 1024 到 65535");
  if (routing.maxRetries < 0 || routing.maxRetries > 10) throw new Error("最大重试次数须为 0 到 10");
  if (routing.failureThreshold < 1 || routing.failureThreshold > 20) throw new Error("失败阈值须为 1 到 20");
  if (routing.successThreshold < 1 || routing.successThreshold > 20) throw new Error("恢复成功阈值须为 1 到 20");
  if (routing.errorRateThreshold < 1 || routing.errorRateThreshold > 100) throw new Error("错误率阈值须为 1% 到 100%");
  if (routing.minimumRequests < 1 || routing.minimumRequests > 100) throw new Error("最小请求数须为 1 到 100");
  if (routing.firstByteTimeout < 1 || routing.firstByteTimeout > 120) throw new Error("首字节超时须为 1 到 120 秒");
  if (routing.idleTimeout < 0 || routing.idleTimeout > 600) throw new Error("流式静默超时须为 0 到 600 秒");
  if (routing.requestTimeout < 1 || routing.requestTimeout > 1200) throw new Error("请求总超时须为 1 到 1200 秒");
  if (routing.autoFailover && providerIds.length === 0) throw new Error("自动故障转移至少需要一个供应商");
}

async function saveRouting(codexHome, input) {
  const state = await readProviderState(codexHome);
  const routing = normalizeRouting(input);
  const validIds = new Set(state.profiles.map((item) => item.id));
  routing.providerIds = routing.providerIds.filter((id) => validIds.has(id));
  validateRouting(routing, routing.providerIds);
  state.routing = routing;
  await writeJson(providerStorePath(codexHome), state);
  return listProviders(codexHome);
}

function mcpDisabledPath(codexHome) {
  return managerPath(codexHome, "disabled-mcp.json");
}

function extensionMetadataPath(codexHome) {
  return managerPath(codexHome, "extension-metadata.json");
}

async function readExtensionMetadata(codexHome) {
  const raw = await readJson(extensionMetadataPath(codexHome), {});
  return {
    skills: raw?.skills && typeof raw.skills === "object" ? raw.skills : {},
    mcp: raw?.mcp && typeof raw.mcp === "object" ? raw.mcp : {},
    lastUpdateCheckAt: typeof raw?.lastUpdateCheckAt === "string" ? raw.lastUpdateCheckAt : null,
  };
}

async function skillSource(codexHome, skill) {
  const root = resolveInside(codexHome, skill.enabled ? "skills" : "skills-disabled", skill.id);
  const gitConfig = path.join(root, ".git", "config");
  try {
    const config = await fsp.readFile(gitConfig, "utf8");
    const remote = config.match(/\[remote\s+"origin"\][\s\S]*?^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
    if (remote) return { root, sourceUrl: remote };
  } catch {
    // The skill may have been installed from a ZIP rather than a Git checkout.
  }
  try {
    const content = await fsp.readFile(path.join(root, "SKILL.md"), "utf8");
    const sourceUrl = content.match(/^\s*(?:source|repository|homepage|url):\s*["']?([^"'\s]+)["']?\s*$/mi)?.[1];
    return { root, sourceUrl: sourceUrl || null };
  } catch {
    return { root, sourceUrl: null };
  }
}

function mcpHeaderName(line) {
  const match = line.match(/^\s*\[mcp_servers\.(?:"([^"]+)"|([^\].]+))\]\s*$/);
  return match ? (match[1] || match[2] || "").trim() : null;
}

function extractMcpBlock(content, name) {
  const lines = String(content || "").split(/\r?\n/);
  const start = lines.findIndex((line) => mcpHeaderName(line) === name);
  if (start < 0) return { content: String(content || ""), block: null };
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const header = lines[index].match(/^\s*\[([^\]]+)\]\s*$/);
    if (!header) continue;
    const section = header[1].replaceAll('"', "");
    if (!section.startsWith(`mcp_servers.${name}.`)) {
      end = index;
      break;
    }
  }
  const block = lines.slice(start, end).join("\n").trim();
  const next = [...lines.slice(0, start), ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { content: `${next}${next ? "\n" : ""}`, block };
}

async function listWorkspaceExtensions(codexHome) {
  const [inventory, disabled, metadata] = await Promise.all([
    listExtensions(codexHome),
    readJson(mcpDisabledPath(codexHome), {}),
    readExtensionMetadata(codexHome),
  ]);
  const disabledServers = Object.entries(disabled).map(([name, value]) => ({
    name,
    transport: value?.transport || "已停用",
    target: value?.target || null,
    enabled: false,
  }));
  return {
    ...inventory,
    skills: await Promise.all(inventory.skills.map(async (item) => {
      const saved = metadata.skills[item.id] || {};
      const source = await skillSource(codexHome, item);
      return {
        ...item,
        note: cleanText(saved.note || "", 500),
        sourceUrl: cleanText(saved.sourceUrl || source.sourceUrl || "", 1000) || null,
        updateStatus: saved.updateStatus || "unchecked",
        currentRef: saved.currentRef || null,
        latestRef: saved.latestRef || null,
        updateCheckedAt: saved.updateCheckedAt || null,
      };
    })),
    mcpServers: [
      ...inventory.mcpServers.map((item) => ({ ...item, enabled: true, note: cleanText(metadata.mcp[item.name]?.note || "", 500) })),
      ...disabledServers,
    ].map((item) => ({ ...item, note: cleanText(item.note || metadata.mcp[item.name]?.note || "", 500) }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    lastUpdateCheckAt: metadata.lastUpdateCheckAt,
  };
}

async function saveExtensionNote(codexHome, kind, id, note) {
  const cleanId = cleanText(id, 120);
  if (!cleanId) throw new Error("扩展标识为空");
  const metadata = await readExtensionMetadata(codexHome);
  const group = kind === "mcp" ? metadata.mcp : metadata.skills;
  group[cleanId] = { ...(group[cleanId] || {}), note: cleanText(note, 500) };
  await writeJson(extensionMetadataPath(codexHome), metadata);
  return listWorkspaceExtensions(codexHome);
}

async function toggleMcp(codexHome, name, enabled) {
  const cleanName = cleanText(name, 120);
  const config = await readManagedFile(codexHome, "config");
  const disabled = await readJson(mcpDisabledPath(codexHome), {});
  if (enabled) {
    const saved = disabled[cleanName];
    if (!saved?.block) throw new Error("未找到已停用的 MCP 配置");
    const next = `${config.content.trimEnd()}${config.content.trim() ? "\n\n" : ""}${saved.block.trim()}\n`;
    delete disabled[cleanName];
    await writeManagedFile(codexHome, "config", next);
  } else {
    const extracted = extractMcpBlock(config.content, cleanName);
    if (!extracted.block) throw new Error("未找到 MCP 配置段");
    const active = (await listExtensions(codexHome)).mcpServers.find((item) => item.name === cleanName);
    disabled[cleanName] = {
      block: extracted.block,
      transport: active?.transport || "未标明",
      target: active?.target || null,
      disabledAt: new Date().toISOString(),
    };
    await writeManagedFile(codexHome, "config", extracted.content);
  }
  await writeJson(mcpDisabledPath(codexHome), disabled);
  return listWorkspaceExtensions(codexHome);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env || process.env,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} 执行失败 (${code})`));
    });
  });
}

function runProcessCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), options.timeoutMs || 15_000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${command} 执行失败 (${code})`));
    });
  });
}

async function inspectSkillUpdate(codexHome, skill) {
  const source = await skillSource(codexHome, skill);
  const result = {
    updateStatus: "unsupported",
    sourceUrl: source.sourceUrl,
    currentRef: null,
    latestRef: null,
    updateCheckedAt: new Date().toISOString(),
  };
  if (!(await pathExists(path.join(source.root, ".git")))) return result;
  try {
    result.currentRef = await runProcessCapture("git", ["rev-parse", "HEAD"], { cwd: source.root, timeoutMs: 8_000 });
    await runProcessCapture("git", ["fetch", "--quiet", "--prune", "origin"], { cwd: source.root, timeoutMs: 20_000 });
    const upstream = await runProcessCapture("git", ["rev-parse", "@{upstream}"], { cwd: source.root, timeoutMs: 8_000 });
    result.latestRef = upstream;
    result.updateStatus = upstream === result.currentRef ? "current" : "available";
  } catch (error) {
    result.updateStatus = "error";
    result.error = cleanText(error?.message || error, 300);
  }
  return result;
}

async function checkSkillUpdates(codexHome) {
  const inventory = await listWorkspaceExtensions(codexHome);
  const metadata = await readExtensionMetadata(codexHome);
  for (const skill of inventory.skills.slice(0, 100)) {
    const status = await inspectSkillUpdate(codexHome, skill);
    metadata.skills[skill.id] = {
      ...(metadata.skills[skill.id] || {}),
      ...status,
    };
  }
  metadata.lastUpdateCheckAt = new Date().toISOString();
  await writeJson(extensionMetadataPath(codexHome), metadata);
  return listWorkspaceExtensions(codexHome);
}

async function updateSkill(codexHome, id) {
  const inventory = await listWorkspaceExtensions(codexHome);
  const skill = inventory.skills.find((item) => item.id === cleanText(id, 120));
  if (!skill) throw new Error("Skill 已不存在，请刷新后重试");
  const source = await skillSource(codexHome, skill);
  if (!(await pathExists(path.join(source.root, ".git")))) throw new Error("该 Skill 不是 Git 安装，需重新导入 ZIP 更新");
  const dirty = await runProcessCapture("git", ["status", "--porcelain"], { cwd: source.root, timeoutMs: 8_000 });
  if (dirty) throw new Error("该 Skill 有本地修改，已保留当前内容");
  await runProcessCapture("git", ["pull", "--ff-only"], { cwd: source.root, timeoutMs: 30_000 });
  return checkSkillUpdates(codexHome);
}

async function findSkillRoot(root) {
  if (await pathExists(path.join(root, "SKILL.md"))) return root;
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length === 1) {
    const nested = path.join(root, directories[0].name);
    if (await pathExists(path.join(nested, "SKILL.md"))) return nested;
  }
  throw new Error("ZIP 中没有找到 SKILL.md");
}

async function installSkillZip(codexHome, zipPath) {
  if (path.extname(zipPath).toLowerCase() !== ".zip") throw new Error("请选择 ZIP 格式的 Skill 包");
  const tempRoot = managerPath(codexHome, `tmp-skill-${Date.now()}-${randomUUID()}`);
  await fsp.mkdir(tempRoot, { recursive: true });
  try {
    await runProcess("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:CAM_SOURCE -DestinationPath $env:CAM_DESTINATION -Force",
    ], {
      env: { ...process.env, CAM_SOURCE: zipPath, CAM_DESTINATION: tempRoot },
    });
    const source = await findSkillRoot(tempRoot);
    const base = providerSlug(path.basename(source) || path.basename(zipPath, ".zip"));
    const destinationRoot = resolveInside(codexHome, "skills");
    let destination = resolveInside(destinationRoot, base);
    if (await pathExists(destination)) destination = resolveInside(destinationRoot, `${base}-${Date.now().toString(36)}`);
    await fsp.mkdir(destinationRoot, { recursive: true });
    await fsp.cp(source, destination, { recursive: true, errorOnExist: true });
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
  return listWorkspaceExtensions(codexHome);
}

async function previewExistingWorkspace(codexHome) {
  const sourceHome = process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), ".codex");
  if (path.resolve(sourceHome) === path.resolve(codexHome)) {
    return { sourceHome, skills: [], mcpServers: [] };
  }
  const current = await listWorkspaceExtensions(codexHome);
  const currentSkillIds = new Set(current.skills.map((item) => item.id));
  const currentMcpNames = new Set(current.mcpServers.map((item) => item.name));
  const skills = [];
  const sourceSkills = path.join(sourceHome, "skills");
  if (await pathExists(sourceSkills)) {
    for (const entry of await fsp.readdir(sourceSkills, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      skills.push({ id: entry.name, exists: currentSkillIds.has(entry.name) });
    }
  }
  const mcpServers = [];
  const sourceConfigPath = path.join(sourceHome, "config.toml");
  if (await pathExists(sourceConfigPath)) {
    const sourceConfig = await fsp.readFile(sourceConfigPath, "utf8");
    const sourceInventory = await listExtensions(sourceHome);
    for (const server of sourceInventory.mcpServers) {
      mcpServers.push({ ...server, exists: currentMcpNames.has(server.name) });
    }
  }
  return { sourceHome, skills, mcpServers };
}

async function importExistingWorkspace(codexHome, selection = null) {
  const sourceHome = process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), ".codex");
  if (path.resolve(sourceHome) === path.resolve(codexHome)) {
    return { importedSkills: 0, importedMcp: 0, inventory: await listWorkspaceExtensions(codexHome) };
  }
  const selectedSkills = Array.isArray(selection?.skills) ? new Set(selection.skills.map(String)) : null;
  const selectedMcp = Array.isArray(selection?.mcpServers) ? new Set(selection.mcpServers.map(String)) : null;
  let importedSkills = 0;
  const sourceSkills = path.join(sourceHome, "skills");
  const destinationSkills = resolveInside(codexHome, "skills");
  if (await pathExists(sourceSkills)) {
    await fsp.mkdir(destinationSkills, { recursive: true });
    for (const entry of await fsp.readdir(sourceSkills, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (selectedSkills && !selectedSkills.has(entry.name)) continue;
      const destination = resolveInside(destinationSkills, entry.name);
      if (await pathExists(destination)) continue;
      await fsp.cp(path.join(sourceSkills, entry.name), destination, { recursive: true });
      importedSkills += 1;
    }
  }
  let importedMcp = 0;
  const sourceConfigPath = path.join(sourceHome, "config.toml");
  if (await pathExists(sourceConfigPath)) {
    const sourceConfig = await fsp.readFile(sourceConfigPath, "utf8");
    const targetConfig = await readManagedFile(codexHome, "config");
    let nextConfig = targetConfig.content;
    const existingNames = new Set(
      (await listExtensions(codexHome)).mcpServers.map((item) => item.name),
    );
    const names = [...sourceConfig.matchAll(/^\s*\[mcp_servers\.(?:"([^"]+)"|([^\].]+))\]\s*$/gm)]
      .map((match) => (match[1] || match[2] || "").trim())
      .filter(Boolean);
    for (const name of names) {
      if (selectedMcp && !selectedMcp.has(name)) continue;
      if (existingNames.has(name)) continue;
      const extracted = extractMcpBlock(sourceConfig, name);
      if (!extracted.block) continue;
      nextConfig = `${nextConfig.trimEnd()}${nextConfig.trim() ? "\n\n" : ""}${extracted.block}\n`;
      existingNames.add(name);
      importedMcp += 1;
    }
    if (nextConfig !== targetConfig.content) {
      await writeManagedFile(codexHome, "config", nextConfig);
    }
  }
  return {
    importedSkills,
    importedMcp,
    inventory: await listWorkspaceExtensions(codexHome),
  };
}

async function compressPaths(paths, destination) {
  if (paths.length === 0) throw new Error("没有可导出的内容");
  await runProcess("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "$paths = @((ConvertFrom-Json $env:CAM_PATHS)); Compress-Archive -LiteralPath $paths -DestinationPath $env:CAM_DESTINATION -Force",
  ], {
    env: {
      ...process.env,
      CAM_PATHS: JSON.stringify(paths),
      CAM_DESTINATION: destination,
    },
  });
  return destination;
}

async function exportWorkspace(codexHome, destination) {
  const candidates = [
    resolveInside(codexHome, "skills"),
    resolveInside(codexHome, "skills-disabled"),
    resolveInside(codexHome, "config.toml"),
    mcpDisabledPath(codexHome),
  ];
  const existing = [];
  for (const candidate of candidates) if (await pathExists(candidate)) existing.push(candidate);
  await compressPaths(existing, destination);
  return { path: destination, itemCount: existing.length };
}

async function exportSessions(codexHome, ids, destination) {
  const root = resolveInside(codexHome, "sessions");
  const paths = ids.map((id) => resolveInside(root, ...String(id).replaceAll("\\", "/").split("/")));
  for (const target of paths) {
    if (!target.toLowerCase().endsWith(".jsonl") || !(await pathExists(target))) {
      throw new Error("待导出的会话文件已不存在");
    }
  }
  await compressPaths(paths, destination);
  return { path: destination, sessionCount: paths.length };
}

function currentSessionTarget(configText) {
  try {
    const parsed = TOML.parse(String(configText || ""));
    return {
      provider: cleanText(parsed.model_provider || "official", 200) || "official",
      model: cleanText(parsed.model || "", 200) || null,
    };
  } catch {
    return { provider: null, model: null };
  }
}

async function listSessionStatus(codexHome) {
  const [sessions, config] = await Promise.all([
    listSessions(codexHome),
    readManagedFile(codexHome, "config"),
  ]);
  const target = currentSessionTarget(config.content);
  return {
    target,
    sessions: sessions.map((session) => {
      const missing = !session.provider && !session.model;
      const providerMismatch = Boolean(target.provider && session.provider && target.provider !== session.provider);
      const modelMismatch = Boolean(target.model && session.model && target.model !== session.model);
      return {
        ...session,
        syncStatus: missing ? "unknown" : providerMismatch || modelMismatch ? "outdated" : "current",
        syncDetail: missing
          ? "会话未记录供应商或模型"
          : providerMismatch || modelMismatch
            ? `当前配置：${target.provider || "未记录"} / ${target.model || "未记录"}`
            : "与当前配置一致",
      };
    }),
  };
}

async function syncSessionMetadata(codexHome, ids) {
  const status = await listSessionStatus(codexHome);
  if (!status.target.provider && !status.target.model) throw new Error("当前 TOML 未记录可同步的供应商或模型");
  const root = resolveInside(codexHome, "sessions");
  const backupRoot = managerPath(codexHome, "session-backups", `${Date.now()}-${randomUUID()}`);
  let changed = 0;
  let skipped = 0;
  const errors = [];
  for (const id of ids.slice(0, 250)) {
    const relative = String(id).replaceAll("\\", "/");
    const filePath = resolveInside(root, ...relative.split("/"));
    try {
      const stat = await fsp.stat(filePath);
      if (stat.size > 64 * 1024 * 1024) throw new Error("会话文件超过 64 MB");
      const source = await fsp.readFile(filePath, "utf8");
      const lines = source.split(/\r?\n/);
      let updated = false;
      for (let index = 0; index < Math.min(lines.length, 80); index += 1) {
        if (!lines[index].trim()) continue;
        let record;
        try { record = JSON.parse(lines[index]); } catch { continue; }
        const payload = record?.payload || record;
        if (record?.type !== "session_meta" && payload?.type !== "session_meta") continue;
        if (status.target.provider) payload.model_provider = status.target.provider;
        if (status.target.model) payload.model = status.target.model;
        lines[index] = JSON.stringify(record);
        updated = true;
        break;
      }
      if (!updated) {
        skipped += 1;
        continue;
      }
      const backup = resolveInside(backupRoot, ...relative.split("/"));
      await fsp.mkdir(path.dirname(backup), { recursive: true });
      await fsp.copyFile(filePath, backup);
      const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
      await fsp.writeFile(temporary, lines.join("\n"), "utf8");
      await fsp.rename(temporary, filePath);
      changed += 1;
    } catch (error) {
      errors.push({ id: relative, message: cleanText(error?.message || error, 300) });
    }
  }
  return { changed, skipped, errors, status: await listSessionStatus(codexHome) };
}

function textFromSessionContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => {
    if (typeof item === "string") return item;
    return item?.text || item?.input_text || item?.output_text || "";
  }).filter(Boolean).join("\n");
}

async function sessionMarkdown(filePath, fallbackTitle) {
  const lines = (await fsp.readFile(filePath, "utf8")).split(/\r?\n/);
  const sections = [];
  let title = fallbackTitle;
  for (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    const payload = record?.payload || record;
    if ((record?.type === "session_meta" || payload?.type === "session_meta") && payload?.title) {
      title = cleanText(payload.title, 200) || title;
    }
    const message = payload?.message || payload;
    const role = message?.role || payload?.role;
    const content = textFromSessionContent(message?.content ?? payload?.content);
    if (!["user", "assistant"].includes(role) || !content.trim()) continue;
    sections.push(`## ${role === "user" ? "用户" : "助手"}\n\n${content.trim()}`);
  }
  return `# ${title}\n\n${sections.join("\n\n")}\n`;
}

async function exportSessionsMarkdown(codexHome, ids, destination) {
  const root = resolveInside(codexHome, "sessions");
  const paths = ids.map((id) => ({
    id: String(id),
    path: resolveInside(root, ...String(id).replaceAll("\\", "/").split("/")),
  }));
  if (paths.length === 1 && path.extname(destination).toLowerCase() === ".md") {
    const markdown = await sessionMarkdown(paths[0].path, path.basename(paths[0].path, ".jsonl"));
    await fsp.writeFile(destination, markdown, "utf8");
    return { path: destination, sessionCount: 1 };
  }
  const tempRoot = managerPath(codexHome, `tmp-session-export-${Date.now()}-${randomUUID()}`);
  await fsp.mkdir(tempRoot, { recursive: true });
  try {
    for (let index = 0; index < paths.length; index += 1) {
      const item = paths[index];
      const name = `${String(index + 1).padStart(3, "0")}-${providerSlug(path.basename(item.path, ".jsonl"))}.md`;
      await fsp.writeFile(path.join(tempRoot, name), await sessionMarkdown(item.path, path.basename(item.path, ".jsonl")), "utf8");
    }
    const files = (await fsp.readdir(tempRoot)).map((name) => path.join(tempRoot, name));
    await compressPaths(files, destination);
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
  return { path: destination, sessionCount: paths.length };
}

async function listBackups(codexHome) {
  const root = resolveInside(codexHome, "backups", "account-manager");
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".bak")) continue;
    const filePath = resolveInside(root, entry.name);
    const stat = await fsp.stat(filePath);
    const kind = entry.name.startsWith("AGENTS.md.")
      ? "instructions"
      : entry.name.startsWith("config.toml.")
        ? "config"
        : entry.name.startsWith("auth.json.")
          ? "auth"
          : null;
    if (!kind) continue;
    backups.push({
      id: entry.name,
      kind,
      name: entry.name,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    });
  }
  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return backups.slice(0, 100);
}

async function restoreBackup(codexHome, id) {
  const cleanId = path.basename(String(id || ""));
  const root = resolveInside(codexHome, "backups", "account-manager");
  const source = resolveInside(root, cleanId);
  if (!(await pathExists(source))) throw new Error("备份文件已不存在");
  const kind = cleanId.startsWith("AGENTS.md.")
    ? "instructions"
    : cleanId.startsWith("config.toml.")
      ? "config"
      : cleanId.startsWith("auth.json.")
        ? "auth"
        : null;
  if (!kind) throw new Error("备份类型不受支持");
  const content = await fsp.readFile(source, "utf8");
  const restored = await writeManagedFile(codexHome, kind, content);
  return { restored, backups: await listBackups(codexHome) };
}

function configFingerprint(content) {
  return createHash("sha256").update(String(content || "")).digest("hex");
}

async function checkConfigHealth(codexHome) {
  const config = await readManagedFile(codexHome, "config");
  const report = {
    status: "healthy",
    checkedAt: new Date().toISOString(),
    fingerprint: configFingerprint(config.content),
    canRepair: false,
    issues: [],
    repairSummary: [],
  };
  if (!config.exists || !config.content.trim()) {
    report.status = "warning";
    report.issues.push({ code: "config_missing", level: "warning", message: "config.toml 尚未创建", repairable: false });
    return report;
  }
  let parsed;
  try {
    parsed = TOML.parse(config.content);
  } catch (error) {
    report.status = "error";
    report.issues.push({ code: "toml_invalid", level: "error", message: `TOML 格式异常：${cleanText(error?.message || error, 300)}`, repairable: false });
    return report;
  }
  const activeId = cleanText(parsed.model_provider, 120);
  if (activeId === "official") return report;
  if (!activeId) return report;
  const builtIn = new Set(["openai", "azure", "amazon-bedrock", "ollama"]);
  if (builtIn.has(activeId)) return report;
  const table = parsed?.model_providers?.[activeId];
  const providerState = await readProviderState(codexHome);
  const saved = providerState.profiles.find((item) => item.id === activeId);
  if (!table || typeof table !== "object") {
    report.status = "error";
    const repairable = Boolean(saved);
    report.issues.push({ code: "provider_missing", level: "error", message: `当前供应商 ${activeId} 缺少配置段`, repairable });
    if (repairable) report.repairSummary.push(`从本地供应商资料恢复 ${saved.name}`);
  } else {
    if (!cleanText(table.base_url, 500)) {
      const repairable = Boolean(saved?.baseUrl);
      report.status = "error";
      report.issues.push({ code: "base_url_missing", level: "error", message: `供应商 ${activeId} 缺少 base_url`, repairable });
      if (repairable) report.repairSummary.push(`补全 ${activeId} 的 API 地址`);
    }
    if (!table.wire_api) {
      report.status = report.status === "error" ? "error" : "warning";
      report.issues.push({ code: "wire_api_missing", level: "warning", message: `供应商 ${activeId} 未声明 wire_api`, repairable: true });
      report.repairSummary.push(`为 ${activeId} 补充 responses 传输类型`);
    }
    if (typeof table.requires_openai_auth !== "boolean") {
      report.status = report.status === "error" ? "error" : "warning";
      report.issues.push({ code: "auth_flag_missing", level: "warning", message: `供应商 ${activeId} 未声明认证方式`, repairable: true });
      report.repairSummary.push(`为 ${activeId} 补充认证方式`);
    }
  }
  if (!cleanText(parsed.model, 200) && saved?.model) {
    report.status = report.status === "error" ? "error" : "warning";
    report.issues.push({ code: "model_missing", level: "warning", message: "当前配置缺少默认模型", repairable: true });
    report.repairSummary.push(`恢复默认模型 ${saved.model}`);
  }
  report.canRepair = report.issues.some((item) => item.repairable);
  return report;
}

function insertTomlRoot(content, line) {
  const lines = String(content || "").split(/\r?\n/);
  const firstSection = lines.findIndex((item) => /^\s*\[/.test(item));
  lines.splice(firstSection < 0 ? lines.length : firstSection, 0, line);
  return lines.join("\n");
}

function insertTomlSectionValue(content, sectionId, line) {
  const lines = String(content || "").split(/\r?\n/);
  const headerForms = [`[model_providers.${sectionId}]`, `[model_providers.${JSON.stringify(sectionId)}]`];
  const start = lines.findIndex((item) => headerForms.includes(item.trim()));
  if (start < 0) return content;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) { end = index; break; }
  }
  lines.splice(end, 0, line);
  return lines.join("\n");
}

async function repairConfigHealth(codexHome, expectedFingerprint) {
  const before = await readManagedFile(codexHome, "config");
  const report = await checkConfigHealth(codexHome);
  if (expectedFingerprint && report.fingerprint !== expectedFingerprint) {
    throw new Error("配置已发生变化，请重新检查后再修复");
  }
  if (!report.canRepair) return { changed: false, report, backupPath: null };
  const parsed = TOML.parse(before.content);
  const activeId = cleanText(parsed.model_provider, 120);
  const state = await readProviderState(codexHome);
  const saved = state.profiles.find((item) => item.id === activeId);
  let next = before.content;
  const table = parsed?.model_providers?.[activeId];
  if ((!table || typeof table !== "object") && saved) {
    const section = buildProviderToml(saved).split(/\r?\n/).filter((line) =>
      !/^\s*(model|model_provider|model_context_window)\s*=/.test(line),
    ).join("\n").trim();
    next = `${next.trimEnd()}\n\n${section}\n`;
  } else if (table && typeof table === "object") {
    if (!cleanText(table.base_url, 500) && saved?.baseUrl) next = insertTomlSectionValue(next, activeId, `base_url = ${tomlString(saved.baseUrl)}`);
    if (!table.wire_api) next = insertTomlSectionValue(next, activeId, `wire_api = ${tomlString(saved?.wireApi || "responses")}`);
    if (typeof table.requires_openai_auth !== "boolean") next = insertTomlSectionValue(next, activeId, `requires_openai_auth = ${saved?.requiresOpenaiAuth ? "true" : "false"}`);
  }
  if (!cleanText(parsed.model, 200) && saved?.model) next = insertTomlRoot(next, `model = ${tomlString(saved.model)}`);
  if (next === before.content) return { changed: false, report, backupPath: null };
  const savedFile = await writeManagedFile(codexHome, "config", next);
  return { changed: true, report: await checkConfigHealth(codexHome), backupPath: savedFile.backupPath };
}

async function runDiagnostics(codexHome) {
  const checks = [];
  const push = (id, label, status, detail, action = null) => checks.push({ id, label, status, detail, action });
  const authPath = resolveInside(codexHome, "auth.json");
  try {
    const auth = JSON.parse(await fsp.readFile(authPath, "utf8"));
    push("auth", "登录文件", auth && typeof auth === "object" ? "ok" : "warning", "auth.json 可读取", "relogin");
  } catch (error) {
    push("auth", "登录文件", "error", error?.code === "ENOENT" ? "尚未登录" : "auth.json 格式异常", "relogin");
  }
  const config = await readManagedFile(codexHome, "config");
  const configHealth = await checkConfigHealth(codexHome);
  push(
    "config",
    "Codex 配置",
    configHealth.status === "healthy" ? "ok" : configHealth.status === "error" ? "error" : "warning",
    configHealth.status === "healthy" ? "config.toml 结构正常" : configHealth.issues.map((item) => item.message).join("；"),
    configHealth.canRepair ? "repair-config" : "open-config",
  );
  const inventory = await listWorkspaceExtensions(codexHome);
  push("skills", "Skills", "ok", `${inventory.skills.filter((item) => item.enabled).length} 个启用，${inventory.skills.filter((item) => !item.enabled).length} 个停用`, "open-skills");
  push("mcp", "MCP Servers", "ok", `${inventory.mcpServers.filter((item) => item.enabled).length} 个启用`, "open-skills");
  const sessions = await listSessions(codexHome);
  push("sessions", "本地会话", "ok", `${sessions.length} 个会话可管理`, "open-sessions");
  const probe = managerPath(codexHome, `.write-probe-${process.pid}`);
  try {
    await fsp.mkdir(path.dirname(probe), { recursive: true });
    await fsp.writeFile(probe, "ok", "utf8");
    await fsp.rm(probe, { force: true });
    push("write", "目录写入", "ok", "账号目录可正常写入");
  } catch (error) {
    push("write", "目录写入", "error", String(error?.message || error));
  }
  return {
    checkedAt: new Date().toISOString(),
    codexHome,
    status: checks.some((item) => item.status === "error") ? "error" : checks.some((item) => item.status === "warning") ? "warning" : "ok",
    checks,
    configHealth,
  };
}

module.exports = {
  activateProvider,
  checkConfigHealth,
  checkSkillUpdates,
  deletePromptCategory,
  deletePrompt,
  deleteProvider,
  duplicateProvider,
  exportSessions,
  exportSessionsMarkdown,
  exportWorkspace,
  importPrompt,
  importCcSwitchProviders,
  importExistingWorkspace,
  installSkillZip,
  listBackups,
  listPrompts,
  listProviders,
  listSessionStatus,
  listWorkspaceExtensions,
  normalizeRouting,
  previewExistingWorkspace,
  providerModelsUrl,
  providerStorePath,
  readProviderState,
  repairConfigHealth,
  restoreBackup,
  runDiagnostics,
  savePrompt,
  savePromptCategory,
  saveProvider,
  saveRouting,
  saveExtensionNote,
  setContextWindow,
  setPromptMode,
  stripProviderConfig,
  syncPromptCatalog,
  syncSessionMetadata,
  testProvider,
  toggleMcp,
  togglePrompt,
  updateSkill,
  writeProviderState: async (codexHome, state) => {
    await writeJson(providerStorePath(codexHome), state);
  },
};
