import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createAccountLabel, labelAfterLogin, renameAccountLabel } = require(
  "../electron/account-label.cjs",
) as {
  createAccountLabel(value: string): { label: string; labelSource: string };
  labelAfterLogin(
    account: { label: string; labelSource?: string; account?: { email?: string } },
    email: string,
  ): { label: string; labelSource: string };
  renameAccountLabel(value: string, email: string): {
    label: string;
    labelSource: string;
  };
};

describe("account display names", () => {
  it("uses the email local part when the optional name is left empty", () => {
    const created = createAccountLabel("");
    expect(created).toEqual({ label: "新账号", labelSource: "email" });
    expect(labelAfterLogin(created, "sample.user@example.com")).toEqual({
      label: "sample.user",
      labelSource: "email",
    });
  });

  it("preserves a name entered by the user", () => {
    const created = createAccountLabel("主力开发");
    expect(labelAfterLogin(created, "sample.user@example.com")).toEqual({
      label: "主力开发",
      labelSource: "custom",
    });
  });

  it("restores the email-based name when a rename is cleared", () => {
    expect(renameAccountLabel("  ", "sample.user@example.com")).toEqual({
      label: "sample.user",
      labelSource: "email",
    });
  });
});
