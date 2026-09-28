import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { loadStoreDocument } = require("../electron/account-store.cjs") as {
  loadStoreDocument(paths: StorePaths): Promise<{
    document: { version: number; accounts: Array<{ id: string }> };
    recoveredFromBackup: boolean;
    created: boolean;
  }>;
};

interface StorePaths {
  root: string;
  profiles: string;
  store: string;
  backup: string;
  temp: string;
}

async function createPaths() {
  const root = await mkdtemp(path.join(tmpdir(), "codex-account-store-"));
  const profiles = path.join(root, "profiles");
  await mkdir(profiles, { recursive: true });
  return {
    root,
    profiles,
    store: path.join(root, "accounts.json"),
    backup: path.join(root, "accounts.backup.json"),
    temp: path.join(root, "accounts.pending.json"),
  } satisfies StorePaths;
}

const validDocument = {
  version: 2,
  accounts: [{ id: "account-1" }],
};

describe("account store recovery", () => {
  it("restores a missing primary file from a validated backup", async () => {
    const paths = await createPaths();
    await mkdir(path.join(paths.profiles, "account-1"));
    await writeFile(paths.backup, JSON.stringify(validDocument), "utf8");

    const result = await loadStoreDocument(paths);

    expect(result.recoveredFromBackup).toBe(true);
    expect(result.document.accounts).toEqual([{ id: "account-1" }]);
    expect(JSON.parse(await readFile(paths.store, "utf8"))).toEqual(validDocument);
  });

  it("stops recovery when profiles exist without either index file", async () => {
    const paths = await createPaths();
    const profile = path.join(paths.profiles, "account-1");
    await mkdir(profile);

    await expect(loadStoreDocument(paths)).rejects.toMatchObject({
      code: "EACCOUNTSTORE",
    });
    expect((await stat(profile)).isDirectory()).toBe(true);
  });

  it("restores an invalid primary from backup and keeps a quarantine copy", async () => {
    const paths = await createPaths();
    await writeFile(paths.store, "{invalid", "utf8");
    await writeFile(paths.backup, JSON.stringify(validDocument), "utf8");

    const result = await loadStoreDocument(paths);

    expect(result.recoveredFromBackup).toBe(true);
    expect(await readFile(path.join(paths.root, "accounts.corrupt.json"), "utf8"))
      .toBe("{invalid");
    expect(JSON.parse(await readFile(paths.store, "utf8"))).toEqual(validDocument);
  });

  it("recovers a validated pending write after an interrupted save", async () => {
    const paths = await createPaths();
    await mkdir(path.join(paths.profiles, "account-1"));
    await writeFile(paths.temp, JSON.stringify(validDocument), "utf8");

    const result = await loadStoreDocument(paths);

    expect(result.document.accounts).toEqual([{ id: "account-1" }]);
    expect(JSON.parse(await readFile(paths.store, "utf8"))).toEqual(validDocument);
    expect(JSON.parse(await readFile(paths.backup, "utf8"))).toEqual(validDocument);
  });

  it("uses a validated pending write when the backup is invalid", async () => {
    const paths = await createPaths();
    await mkdir(path.join(paths.profiles, "account-1"));
    await writeFile(paths.backup, "{invalid", "utf8");
    await writeFile(paths.temp, JSON.stringify(validDocument), "utf8");

    const result = await loadStoreDocument(paths);

    expect(result.recoveredFromBackup).toBe(false);
    expect(result.document.accounts).toEqual([{ id: "account-1" }]);
    expect(JSON.parse(await readFile(paths.store, "utf8"))).toEqual(validDocument);
    expect(JSON.parse(await readFile(paths.backup, "utf8"))).toEqual(validDocument);
  });

  it("keeps account profiles when both primary and backup are invalid", async () => {
    const paths = await createPaths();
    const profile = path.join(paths.profiles, "account-1");
    await mkdir(profile);
    await writeFile(paths.store, "{invalid", "utf8");
    await writeFile(paths.backup, "[]", "utf8");

    await expect(loadStoreDocument(paths)).rejects.toMatchObject({
      code: "EACCOUNTSTORE",
    });
    expect((await stat(profile)).isDirectory()).toBe(true);
  });
});
