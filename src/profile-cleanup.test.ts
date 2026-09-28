import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { isManagedProfilePath, removeProfileDirectory } = require(
  "../electron/profile-cleanup.cjs",
) as {
  isManagedProfilePath(profilesRoot: string, profileRoot: string): boolean;
  removeProfileDirectory(
    profilesRoot: string,
    profileRoot: string,
    options?: {
      remove?: (target: string, options: unknown) => Promise<void>;
      sleep?: (milliseconds: number) => Promise<void>;
      retries?: number;
      retryDelayMs?: number;
    },
  ): Promise<{
    removed: boolean;
    deferred: boolean;
    reason?: string;
  }>;
};

const profilesRoot = path.resolve("C:\\manager\\profiles");
const profileRoot = path.join(profilesRoot, "account-1");

function codedError(code: string) {
  return Object.assign(new Error(code), { code });
}

describe("managed profile cleanup", () => {
  it("accepts only direct children of the managed profiles directory", () => {
    expect(isManagedProfilePath(profilesRoot, profileRoot)).toBe(true);
    expect(isManagedProfilePath(profilesRoot, profilesRoot)).toBe(false);
    expect(
      isManagedProfilePath(profilesRoot, path.resolve("C:\\manager\\outside")),
    ).toBe(false);
    expect(
      isManagedProfilePath(profilesRoot, path.join(profileRoot, "codex-home")),
    ).toBe(false);
  });

  it("retries EBUSY and succeeds after the lock is released", async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(codedError("EBUSY"))
      .mockResolvedValueOnce(undefined);

    await expect(
      removeProfileDirectory(profilesRoot, profileRoot, {
        remove,
        sleep: async () => undefined,
        retries: 2,
      }),
    ).resolves.toEqual({ removed: true, deferred: false });
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("returns deferred cleanup when a Windows lock persists", async () => {
    const remove = vi.fn().mockRejectedValue(codedError("EPERM"));

    await expect(
      removeProfileDirectory(profilesRoot, profileRoot, {
        remove,
        sleep: async () => undefined,
        retries: 2,
      }),
    ).resolves.toEqual({
      removed: false,
      deferred: true,
      reason: "EPERM",
    });
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("propagates unexpected filesystem errors", async () => {
    const remove = vi.fn().mockRejectedValue(codedError("EIO"));
    await expect(
      removeProfileDirectory(profilesRoot, profileRoot, { remove }),
    ).rejects.toMatchObject({ code: "EIO" });
  });

  it("rejects deletion outside the managed profiles directory", async () => {
    const remove = vi.fn();
    await expect(
      removeProfileDirectory(
        profilesRoot,
        path.resolve("C:\\manager\\outside"),
        { remove },
      ),
    ).rejects.toMatchObject({ code: "EINVALIDPROFILE" });
    expect(remove).not.toHaveBeenCalled();
  });
});
