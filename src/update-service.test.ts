import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  compareVersions,
  findChecksum,
  selectWindowsAsset,
} = require("../electron/update-service.cjs") as {
  compareVersions(first: string, second: string): number;
  findChecksum(manifest: string, assetName: string): string | null;
  selectWindowsAsset(assets: any[]): any;
};

describe("update service", () => {
  it("compares semantic version tags", () => {
    expect(compareVersions("v0.3.0", "0.2.15")).toBe(1);
    expect(compareVersions("0.3.0", "v0.3.0")).toBe(0);
    expect(compareVersions("0.2.15", "0.3.0")).toBe(-1);
  });

  it("prefers a Windows installer and falls back to portable", () => {
    const portable = {
      name: "Codex Account Manager-0.3.0-x64-portable.exe",
      browser_download_url: "portable",
    };
    const setup = {
      name: "Codex Account Manager-0.3.0-x64-setup.exe",
      browser_download_url: "setup",
    };
    expect(selectWindowsAsset([portable, setup])).toBe(setup);
    expect(selectWindowsAsset([portable])).toBe(portable);
    expect(selectWindowsAsset([{ name: "source.zip" }])).toBeNull();
  });

  it("finds the checksum for an exact release asset name", () => {
    const digest = "a".repeat(64);
    expect(
      findChecksum(
        `${"b".repeat(64)}  other.exe\n${digest} *Codex Account Manager-0.3.0-x64-setup.exe`,
        "Codex Account Manager-0.3.0-x64-setup.exe",
      ),
    ).toBe(digest.toUpperCase());
    expect(findChecksum(`${digest}  other.exe`, "setup.exe")).toBeNull();
  });
});
