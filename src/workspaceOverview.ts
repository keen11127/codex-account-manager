export function parseWorkspaceToml(content: string) {
  const read = (key: string) => {
    const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`, "m"));
    return match?.[1]?.trim() || null;
  };
  return {
    model: read("model"),
    provider: read("model_provider"),
    instructions: read("model_instructions_file"),
  };
}
