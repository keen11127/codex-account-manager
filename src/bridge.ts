import { mockBridge } from "./mockBridge";
import type { CodexManagerBridge } from "./types";

export const bridge: CodexManagerBridge = window.codexManager || mockBridge;

