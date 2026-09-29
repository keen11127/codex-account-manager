import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tools = require("../electron/workspace-tools.cjs") as {
  listExtensions(codexHome: string): Promise<any>;
  listSessions(codexHome: string): Promise<any[]>;
  parseMcpServers(content: string): any[];
  readManagedFile(codexHome: string, kind: string): Promise<any>;
  resolveInside(root: string, ...segments: string[]): string;
  toggleSkill(codexHome: string, id: string, enabled: boolean): Promise<any>;
  writeManagedFile(codexHome: string, kind: string, content: string): Promise<any>;
};

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

async function temporaryHome() {
  const root = await mkdtemp(path.join(tmpdir(), "codex-manager-tools-"));
  cleanup.push(root);
  return root;
}

describe("workspace tools", () => {
  it("keeps managed paths inside the account home", async () => {
    const root = await temporaryHome();
    expect(tools.resolveInside(root, "config.toml")).toBe(path.join(root, "config.toml"));
    expect(() => tools.resolveInside(root, "..", "outside.txt")).toThrow(
      "目标路径超出当前账号目录",
    );
  });

  it("backs up an existing managed file before saving", async () => {
    const root = await temporaryHome();
    await writeFile(path.join(root, "AGENTS.md"), "old", "utf8");

    const saved = await tools.writeManagedFile(root, "instructions", "new");

    expect(saved.content).toBe("new");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe("new");
    expect(await readFile(saved.backupPath, "utf8")).toBe("old");
    expect((await tools.readManagedFile(root, "instructions")).exists).toBe(true);
  });

  it("parses MCP server summaries without exposing environment values", () => {
    const servers = tools.parseMcpServers(`
[mcp_servers.docs]
command = "npx"
args = ["docs-mcp"]
[mcp_servers.docs.env]
TOKEN = "secret"
[mcp_servers."remote-api"]
url = "https://example.test/mcp"
`);

    expect(servers).toEqual([
      { name: "docs", transport: "本地进程", target: "npx" },
      { name: "remote-api", transport: "HTTP", target: "https://example.test/mcp" },
    ]);
    expect(JSON.stringify(servers)).not.toContain("secret");
  });

  it("moves user skills between enabled and disabled directories", async () => {
    const root = await temporaryHome();
    const skill = path.join(root, "skills", "sample-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\ndescription: Sample workflow\n---\n",
      "utf8",
    );

    const initial = await tools.listExtensions(root);
    expect(initial.skills[0]).toMatchObject({
      id: "sample-skill",
      enabled: true,
      description: "Sample workflow",
    });

    const disabled = await tools.toggleSkill(root, "sample-skill", false);
    expect(disabled.skills[0]).toMatchObject({ id: "sample-skill", enabled: false });
    expect(await readdir(path.join(root, "skills-disabled"))).toEqual(["sample-skill"]);
  });

  it("lists session metadata without returning conversation content", async () => {
    const root = await temporaryHome();
    const sessionRoot = path.join(root, "sessions", "2026", "09");
    await mkdir(sessionRoot, { recursive: true });
    await writeFile(
      path.join(sessionRoot, "session.jsonl"),
      `${JSON.stringify({ type: "session_meta", payload: { cwd: "D:\\project", model: "gpt-test" } })}\n${JSON.stringify({ message: "private conversation" })}\n`,
      "utf8",
    );

    const sessions = await tools.listSessions(root);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: "2026/09/session.jsonl",
      projectPath: "D:\\project",
      model: "gpt-test",
    });
    expect(JSON.stringify(sessions)).not.toContain("private conversation");
  });
});
