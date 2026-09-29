import { describe, expect, it } from "vitest";
import { parseWorkspaceToml } from "./workspaceOverview";

describe("parseWorkspaceToml", () => {
  it("reads the active workspace fields without parsing provider tables", () => {
    expect(parseWorkspaceToml(`
model = "gpt-6-sol"
model_provider = 'custom'
model_instructions_file = "./AGENTS.md"

[model_providers.custom]
name = "Primary"
`)).toEqual({
      model: "gpt-6-sol",
      provider: "custom",
      instructions: "./AGENTS.md",
    });
  });

  it("returns nulls for an empty or partial config", () => {
    expect(parseWorkspaceToml("sandbox_mode = \"workspace-write\"\n")).toEqual({
      model: null,
      provider: null,
      instructions: null,
    });
  });
});
