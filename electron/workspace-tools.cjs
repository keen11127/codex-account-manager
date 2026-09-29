const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MANAGED_FILES = {
  instructions: "AGENTS.md",
  config: "config.toml",
};

function resolveInside(root, ...segments) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error("目标路径超出当前账号目录");
}

function cleanRelativeId(value) {
  const id = String(value || "").replaceAll("\\", "/").trim();
  if (!id || id.startsWith("/") || id.includes("../") || id === "..") {
    throw new Error("项目标识格式异常");
  }
  return id;
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readManagedFile(codexHome, kind) {
  const fileName = MANAGED_FILES[kind];
  if (!fileName) throw new Error("不支持的配置文件类型");
  const filePath = resolveInside(codexHome, fileName);

  try {
    const stat = await fsp.stat(filePath);
    if (stat.size > MAX_TEXT_BYTES) throw new Error("配置文件超过 2 MB，未载入编辑器");
    return {
      kind,
      path: filePath,
      exists: true,
      content: await fsp.readFile(filePath, "utf8"),
      updatedAt: stat.mtime.toISOString(),
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      kind,
      path: filePath,
      exists: false,
      content: "",
      updatedAt: null,
    };
  }
}

function backupStamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function writeManagedFile(codexHome, kind, content) {
  const fileName = MANAGED_FILES[kind];
  if (!fileName) throw new Error("不支持的配置文件类型");
  if (typeof content !== "string") throw new Error("配置内容格式异常");
  if (Buffer.byteLength(content, "utf8") > MAX_TEXT_BYTES) {
    throw new Error("配置内容超过 2 MB，未保存");
  }

  await fsp.mkdir(codexHome, { recursive: true });
  const filePath = resolveInside(codexHome, fileName);
  let backupPath = null;
  if (await pathExists(filePath)) {
    const backupRoot = resolveInside(codexHome, "backups", "account-manager");
    await fsp.mkdir(backupRoot, { recursive: true });
    backupPath = resolveInside(
      backupRoot,
      `${fileName}.${backupStamp()}.bak`,
    );
    await fsp.copyFile(filePath, backupPath);
  }

  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(temporaryPath, content, "utf8");
  await fsp.rename(temporaryPath, filePath);
  const stat = await fsp.stat(filePath);
  return {
    kind,
    path: filePath,
    exists: true,
    content,
    updatedAt: stat.mtime.toISOString(),
    backupPath,
  };
}

function readFrontmatterDescription(content) {
  const match = String(content || "").match(/^description:\s*["']?(.+?)["']?\s*$/m);
  return match?.[1]?.trim().slice(0, 240) || null;
}

async function describeSkill(root, entry, enabled) {
  const skillPath = resolveInside(root, entry.name);
  let description = null;
  try {
    const skillFile = resolveInside(skillPath, "SKILL.md");
    const handle = await fsp.open(skillFile, "r");
    try {
      const buffer = Buffer.alloc(16 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      description = readFrontmatterDescription(buffer.subarray(0, bytesRead).toString("utf8"));
    } finally {
      await handle.close();
    }
  } catch {
    description = null;
  }

  return {
    id: entry.name,
    name: entry.name,
    enabled,
    canToggle: !entry.name.startsWith("."),
    description,
  };
}

async function listDirectoryEntries(root) {
  try {
    return (await fsp.readdir(root, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() || entry.isSymbolicLink(),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function parseMcpServers(content) {
  const servers = [];
  let current = null;
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const header = rawLine.match(/^\s*\[mcp_servers\.(?:"([^"]+)"|([^\].]+))\]\s*$/);
    if (header) {
      current = {
        name: (header[1] || header[2] || "").trim(),
        transport: "未标明",
        target: null,
      };
      if (current.name && !servers.some((item) => item.name === current.name)) {
        servers.push(current);
      }
      continue;
    }
    if (/^\s*\[/.test(rawLine)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const url = rawLine.match(/^\s*url\s*=\s*["']([^"']+)["']/);
    if (url) {
      current.transport = "HTTP";
      current.target = url[1];
      continue;
    }
    const command = rawLine.match(/^\s*command\s*=\s*["']([^"']+)["']/);
    if (command) {
      current.transport = "本地进程";
      current.target = command[1];
    }
  }
  return servers;
}

async function listExtensions(codexHome) {
  const enabledRoot = resolveInside(codexHome, "skills");
  const disabledRoot = resolveInside(codexHome, "skills-disabled");
  const [enabledEntries, disabledEntries, config] = await Promise.all([
    listDirectoryEntries(enabledRoot),
    listDirectoryEntries(disabledRoot),
    readManagedFile(codexHome, "config"),
  ]);
  const skills = await Promise.all([
    ...enabledEntries.map((entry) => describeSkill(enabledRoot, entry, true)),
    ...disabledEntries.map((entry) => describeSkill(disabledRoot, entry, false)),
  ]);
  skills.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return {
    skills,
    mcpServers: parseMcpServers(config.content),
    skillsDirectory: enabledRoot,
    disabledSkillsDirectory: disabledRoot,
  };
}

async function toggleSkill(codexHome, id, enabled) {
  const cleanId = cleanRelativeId(id);
  if (cleanId.includes("/")) throw new Error("Skill 标识格式异常");
  if (cleanId.startsWith(".")) throw new Error("内置 Skill 不支持停用");
  const enabledRoot = resolveInside(codexHome, "skills");
  const disabledRoot = resolveInside(codexHome, "skills-disabled");
  const sourceRoot = enabled ? disabledRoot : enabledRoot;
  const destinationRoot = enabled ? enabledRoot : disabledRoot;
  const source = resolveInside(sourceRoot, cleanId);
  const destination = resolveInside(destinationRoot, cleanId);
  if (!(await pathExists(source))) throw new Error("Skill 已不存在，请刷新后重试");
  if (await pathExists(destination)) throw new Error("目标目录中已有同名 Skill");
  await fsp.mkdir(destinationRoot, { recursive: true });
  await fsp.rename(source, destination);
  return listExtensions(codexHome);
}

async function collectSessionFiles(root, current, depth, output) {
  if (depth > 7 || output.length >= 500) return;
  let entries;
  try {
    entries = await fsp.readdir(current, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (output.length >= 500) break;
    const target = resolveInside(root, path.relative(root, current), entry.name);
    if (entry.isDirectory()) {
      await collectSessionFiles(root, target, depth + 1, output);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")) {
      const stat = await fsp.stat(target);
      output.push({ path: target, stat });
    }
  }
}

async function readSessionMetadata(filePath) {
  try {
    const handle = await fsp.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(64 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const lines = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/).slice(0, 30);
      for (const line of lines) {
        if (!line.trim()) continue;
        const record = JSON.parse(line);
        const payload = record?.payload || record;
        if (record?.type === "session_meta" || payload?.type === "session_meta") {
          return {
            projectPath: payload?.cwd || payload?.project_path || null,
            model: payload?.model || null,
          };
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    // Session metadata is optional; the file remains manageable by filename.
  }
  return { projectPath: null, model: null };
}

async function listSessions(codexHome) {
  const root = resolveInside(codexHome, "sessions");
  const files = [];
  await collectSessionFiles(root, root, 0, files);
  files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return Promise.all(
    files.slice(0, 250).map(async ({ path: filePath, stat }) => {
      const metadata = await readSessionMetadata(filePath);
      return {
        id: path.relative(root, filePath).replaceAll("\\", "/"),
        name: path.basename(filePath, path.extname(filePath)),
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        projectPath: metadata.projectPath,
        model: metadata.model,
      };
    }),
  );
}

function resolveSessionPath(codexHome, id) {
  const root = resolveInside(codexHome, "sessions");
  const cleanId = cleanRelativeId(id);
  const target = resolveInside(root, ...cleanId.split("/"));
  if (path.extname(target).toLowerCase() !== ".jsonl") {
    throw new Error("会话文件类型异常");
  }
  return target;
}

function getToolPath(codexHome, kind) {
  if (kind === "home") return path.resolve(codexHome);
  if (kind === "skills") return resolveInside(codexHome, "skills");
  if (kind === "sessions") return resolveInside(codexHome, "sessions");
  if (MANAGED_FILES[kind]) return resolveInside(codexHome, MANAGED_FILES[kind]);
  throw new Error("不支持的工具目录类型");
}

module.exports = {
  getToolPath,
  listExtensions,
  listSessions,
  parseMcpServers,
  readFrontmatterDescription,
  readManagedFile,
  resolveInside,
  resolveSessionPath,
  toggleSkill,
  writeManagedFile,
};
