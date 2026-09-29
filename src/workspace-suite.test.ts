import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const suite = require("../electron/workspace-suite.cjs") as Record<string, (...args: any[]) => Promise<any>>;
const run = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

async function home(prefix = "codex-suite-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  cleanup.push(root);
  return root;
}

describe("workspace suite", () => {
  it("composes enabled prompts and restores the original instructions", async () => {
    const root = await home();
    await writeFile(path.join(root, "AGENTS.md"), "# Original\n\nKeep this.\n", "utf8");
    let library = await suite.savePrompt(root, {
      title: "Fixture",
      category: "Test",
      content: "Follow fixture rules.",
    });
    const prompt = library.prompts.find((item: any) => item.title === "Fixture");
    library = await suite.togglePrompt(root, prompt.id, true);
    const enabled = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(enabled).toContain("# Original");
    expect(enabled).toContain("ACCOUNT MANAGER PROMPTS:START");
    expect(enabled).toContain("Follow fixture rules.");

    await suite.togglePrompt(root, prompt.id, false);
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe("# Original\n\nKeep this.\n");
    expect(library.categories).toContain("Test");
  });

  it("keeps exactly one prompt active and replaces the previous managed block", async () => {
    const root = await home();
    await writeFile(path.join(root, "AGENTS.md"), "# Existing\n", "utf8");
    const firstLibrary = await suite.savePrompt(root, {
      title: "First fixture",
      category: "Test",
      content: "FIRST_RULE",
    });
    const first = firstLibrary.prompts.find((item: any) => item.title === "First fixture");
    const secondLibrary = await suite.savePrompt(root, {
      title: "Second fixture",
      category: "Test",
      content: "SECOND_RULE",
    });
    const second = secondLibrary.prompts.find((item: any) => item.title === "Second fixture");

    await suite.togglePrompt(root, first.id, true);
    const result = await suite.togglePrompt(root, second.id, true);
    const instructions = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(result.activeIds).toEqual([second.id]);
    expect(instructions).toContain("SECOND_RULE");
    expect(instructions).not.toContain("FIRST_RULE");
  });

  it("uses an independent instruction file in replace mode and restores the prior config", async () => {
    const root = await home();
    const originalAgents = "# Existing instructions\n\nKeep this file.\n";
    const originalConfig = 'model_instructions_file = "./original.md"\nmodel = "fixture"\n\n[mcp_servers.docs]\ncommand = "npx"\n';
    await writeFile(path.join(root, "AGENTS.md"), originalAgents, "utf8");
    await writeFile(path.join(root, "config.toml"), originalConfig, "utf8");
    const library = await suite.savePrompt(root, {
      title: "Replace fixture",
      category: "Test",
      content: "REPLACE_RULE",
    });
    const prompt = library.prompts.find((item: any) => item.title === "Replace fixture");

    await suite.togglePrompt(root, prompt.id, true);
    const replaced = await suite.setPromptMode(root, "replace");
    expect(replaced.activeIds).toEqual([prompt.id]);
    expect(replaced.instructionsPath).toContain("active-instructions.md");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe(originalAgents);
    expect(await readFile(path.join(root, ".account-manager", "active-instructions.md"), "utf8")).toContain("REPLACE_RULE");
    expect(await readFile(path.join(root, "config.toml"), "utf8")).toContain('model_instructions_file = "./.account-manager/active-instructions.md"');

    await suite.togglePrompt(root, prompt.id, false);
    expect(await readFile(path.join(root, "config.toml"), "utf8")).toBe(originalConfig);
    await expect(stat(path.join(root, ".account-manager", "active-instructions.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores the previous config when switching from replace back to append", async () => {
    const root = await home();
    const originalConfig = 'model = "fixture"\n\n[features]\njs_repl = true\n';
    await writeFile(path.join(root, "config.toml"), originalConfig, "utf8");
    const library = await suite.savePrompt(root, {
      title: "Mode fixture",
      category: "Test",
      content: "MODE_RULE",
    });
    const prompt = library.prompts.find((item: any) => item.title === "Mode fixture");
    await suite.togglePrompt(root, prompt.id, true);
    await suite.setPromptMode(root, "replace");
    await writeFile(path.join(root, "AGENTS.md"), "USER_EDIT\n", "utf8");
    const append = await suite.setPromptMode(root, "append");

    expect(append.instructionsPath).toBe(path.join(root, "AGENTS.md"));
    expect(await readFile(path.join(root, "config.toml"), "utf8")).toBe(originalConfig);
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("USER_EDIT");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("MODE_RULE");
  });

  it("removes a prompt-created config file when no config existed before replace mode", async () => {
    const root = await home();
    const library = await suite.savePrompt(root, {
      title: "No config fixture",
      category: "Test",
      content: "NO_CONFIG_RULE",
    });
    const prompt = library.prompts.find((item: any) => item.title === "No config fixture");
    await suite.setPromptMode(root, "replace");
    await suite.togglePrompt(root, prompt.id, true);
    expect(await readFile(path.join(root, "config.toml"), "utf8")).toContain("model_instructions_file");

    await suite.togglePrompt(root, prompt.id, false);
    await expect(stat(path.join(root, "config.toml"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("ships the integrated prompt set locally and syncs it without duplicate remote entries", async () => {
    const root = await home();
    const initial = await suite.listPrompts(root);
    const integratedIds = [
      "gpt5.5-unrestricted",
      "gpt5.4-unrestricted",
      "gpt5.5-jeli",
      "github-gpt-5-6-sol-unrestricted-33b86c71",
      "github-3-0-b459e1e8",
    ];
    expect(integratedIds.every((id) => initial.prompts.some((item: any) => item.id === id))).toBe(true);

    const catalog = {
      templates: [{
        id: "gpt5.5-unrestricted",
        revision: "fixture-2",
        title: "Updated fixture",
        category: "逆向模板",
        description: "fixture",
        content: "UPDATED_RULE",
      }],
    };
    const url = `data:application/json,${encodeURIComponent(JSON.stringify(catalog))}`;
    const synced = await suite.syncPromptCatalog(root, url);
    expect(synced.library.prompts.filter((item: any) => item.id === "gpt5.5-unrestricted")).toHaveLength(1);
    expect(synced.library.prompts.some((item: any) => item.id === "remote-gpt5.5-unrestricted")).toBe(false);
  });

  it("keeps provider secrets out of inventory and preserves unrelated TOML", async () => {
    const root = await home();
    const original = "model = \"official\"\n\n[mcp_servers.docs]\ncommand = \"npx\"\n";
    await writeFile(path.join(root, "config.toml"), original, "utf8");
    await writeFile(path.join(root, "auth.json"), "{}", "utf8");
    let inventory = await suite.saveProvider(root, {
      name: "Fixture API",
      baseUrl: "https://api.example.test/v1",
      model: "fixture-model",
      apiKey: "sk-private-value",
      wireApi: "responses",
      requiresOpenaiAuth: false,
      tomlConfig: "model = \"fixture-model\"\nexperimental_bearer_token = \"sk-inline-secret\"\n",
    });
    expect(JSON.stringify(inventory)).not.toContain("sk-private-value");
    expect(JSON.stringify(inventory)).not.toContain("sk-inline-secret");

    inventory = await suite.activateProvider(root, inventory.profiles[0].id);
    const active = await readFile(path.join(root, "config.toml"), "utf8");
    expect(active).toContain("sk-private-value");
    expect(active).toContain("[mcp_servers.docs]");
    await suite.activateProvider(root, "official");
    expect(await readFile(path.join(root, "config.toml"), "utf8")).toBe(original);
  });

  it("imports Provider rows from a SQLite database and de-duplicates secrets", async () => {
    const root = await home();
    const dbPath = path.join(root, "provider fixture.db");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE providers (id TEXT, name TEXT, settings_config TEXT, category TEXT, app_type TEXT)");
    const settings = JSON.stringify({
      auth: { OPENAI_API_KEY: "sk-db-secret" },
      config: 'model = "fixture-model"\nmodel_provider = "custom"\n[model_providers.custom]\nname = "Fixture"\nbase_url = "https://api.example.test/v1"\nwire_api = "responses"\n',
    });
    db.prepare("INSERT INTO providers VALUES (?, ?, ?, ?, ?)").run("fixture", "Fixture", settings, "", "codex");
    db.close();

    const result = await suite.importCcSwitchProviders(root, dbPath);
    expect(result.added).toBe(1);
    expect(result.inventory.profiles[0]).toMatchObject({ name: "Fixture", model: "fixture-model", apiKeySet: true });
    expect(JSON.stringify(result)).not.toContain("sk-db-secret");
  });

  it("disables and restores a complete MCP block without changing other settings", async () => {
    const root = await home();
    const config = 'model = "fixture"\n\n[mcp_servers.docs]\ncommand = "npx"\nargs = ["docs"]\n[mcp_servers.docs.env]\nTOKEN = "keep"\n\n[features]\njs_repl = true\n';
    await writeFile(path.join(root, "config.toml"), config, "utf8");
    let inventory = await suite.toggleMcp(root, "docs", false);
    expect(inventory.mcpServers.find((item: any) => item.name === "docs")?.enabled).toBe(false);
    expect(await readFile(path.join(root, "config.toml"), "utf8")).toContain("[features]");
    expect(await readFile(path.join(root, "config.toml"), "utf8")).not.toContain("[mcp_servers.docs]");

    inventory = await suite.toggleMcp(root, "docs", true);
    const restored = await readFile(path.join(root, "config.toml"), "utf8");
    expect(restored).toContain("[mcp_servers.docs.env]");
    expect(restored).toContain('TOKEN = "keep"');
    expect(inventory.mcpServers.find((item: any) => item.name === "docs")?.enabled).toBe(true);
  });

  it("installs and exports ZIP content through paths containing spaces and Chinese", async () => {
    if (process.platform !== "win32") return;
    const root = await home("额度 管理-");
    const source = path.join(root, "压缩 来源", "sample-skill");
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, "SKILL.md"), "---\ndescription: Fixture ZIP\n---\n", "utf8");
    const zipPath = path.join(root, "技能 包.zip");
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Compress-Archive -LiteralPath $env:CAM_SOURCE -DestinationPath $env:CAM_DESTINATION -Force"], {
      env: { ...process.env, CAM_SOURCE: source, CAM_DESTINATION: zipPath },
    });

    const inventory = await suite.installSkillZip(root, zipPath);
    expect(inventory.skills.some((item: any) => item.description === "Fixture ZIP")).toBe(true);
    const exported = path.join(root, "导出 结果.zip");
    const result = await suite.exportWorkspace(root, exported);
    expect(result.itemCount).toBeGreaterThan(0);
    expect((await stat(exported)).size).toBeGreaterThan(0);
  });

  it("backs up and synchronizes session metadata without changing messages", async () => {
    const root = await home();
    await writeFile(path.join(root, "config.toml"), 'model = "new-model"\nmodel_provider = "new-provider"\n', "utf8");
    const sessions = path.join(root, "sessions", "2026", "09");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, "fixture.jsonl");
    await writeFile(file, `${JSON.stringify({ type: "session_meta", payload: { model: "old", model_provider: "old-provider" } })}\n${JSON.stringify({ role: "user", content: "keep private message" })}\n`, "utf8");
    const before = await suite.listSessionStatus(root);
    expect(before.sessions[0].syncStatus).toBe("outdated");

    const result = await suite.syncSessionMetadata(root, [before.sessions[0].id]);
    expect(result.changed).toBe(1);
    const updated = await readFile(file, "utf8");
    expect(updated).toContain('"model":"new-model"');
    expect(updated).toContain("keep private message");
  });

  it("repairs safe provider fields and preserves unrelated config", async () => {
    const root = await home();
    await writeFile(path.join(root, "config.toml"), 'model = "fixture"\nmodel_provider = "fixture-api"\n\n[model_providers."fixture-api"]\nname = "Fixture"\nbase_url = "https://api.example.test/v1"\n\n[mcp_servers.docs]\ncommand = "npx"\n', "utf8");
    const report = await suite.checkConfigHealth(root);
    expect(report.canRepair).toBe(true);
    const repaired = await suite.repairConfigHealth(root, report.fingerprint);
    expect(repaired.changed).toBe(true);
    const config = await readFile(path.join(root, "config.toml"), "utf8");
    expect(config).toContain('wire_api = "responses"');
    expect(config).toContain("requires_openai_auth = false");
    expect(config).toContain("[mcp_servers.docs]");
  });

  it("restores managed backups while preserving a new backup of the current file", async () => {
    const root = await home();
    await writeFile(path.join(root, "config.toml"), "old", "utf8");
    const tools = require("../electron/workspace-tools.cjs");
    await tools.writeManagedFile(root, "config", "new");
    const backups = await suite.listBackups(root);
    expect(backups).toHaveLength(1);
    await suite.restoreBackup(root, backups[0].id);
    expect(await readFile(path.join(root, "config.toml"), "utf8")).toBe("old");
    expect((await suite.listBackups(root)).length).toBeGreaterThanOrEqual(2);
  });

  it("lists and restores auth backups as managed credential files", async () => {
    const root = await home();
    const tools = require("../electron/workspace-tools.cjs");
    await writeFile(path.join(root, "auth.json"), '{"auth_mode":"chatgpt","version":"old"}\n', "utf8");
    await tools.writeManagedFile(root, "auth", '{"auth_mode":"chatgpt","version":"new"}');

    const backup = (await suite.listBackups(root)).find((item: any) => item.kind === "auth");
    expect(backup).toBeTruthy();
    await suite.restoreBackup(root, backup.id);
    expect(JSON.parse(await readFile(path.join(root, "auth.json"), "utf8"))).toMatchObject({
      version: "old",
    });
  });
});
