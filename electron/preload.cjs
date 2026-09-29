const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexManager", {
  isDesktop: true,
  listAccounts: () => ipcRenderer.invoke("accounts:list"),
  createAccount: (label) => ipcRenderer.invoke("accounts:create", label),
  refreshAccount: (id) => ipcRenderer.invoke("accounts:refresh", id),
  refreshAll: () => ipcRenderer.invoke("accounts:refresh-all"),
  loginAccount: (id) => ipcRenderer.invoke("accounts:login", id),
  renameAccount: (id, label) =>
    ipcRenderer.invoke("accounts:rename", id, label),
  removeAccount: (id) => ipcRenderer.invoke("accounts:remove", id),
  consumeResetCredit: (id, creditId) =>
    ipcRenderer.invoke("accounts:consume-reset", id, creditId),
  consumeResetCredits: (targets) =>
    ipcRenderer.invoke("accounts:consume-reset-bulk", targets),
  launchCodex: (id) => ipcRenderer.invoke("accounts:launch", id),
  openProfile: (id) => ipcRenderer.invoke("accounts:open-profile", id),
  openDataDirectory: () => ipcRenderer.invoke("system:open-data"),
  openUsage: () => ipcRenderer.invoke("external:usage"),
  openCodexWeb: () => ipcRenderer.invoke("external:codex"),
  openOfficialChannel: () => ipcRenderer.invoke("external:official-channel"),
  openVpnSponsor: () => ipcRenderer.invoke("external:vpn-sponsor"),
  openRepository: () => ipcRenderer.invoke("external:repository"),
  readManagedFile: (id, kind) =>
    ipcRenderer.invoke("tools:read-file", id, kind),
  writeManagedFile: (id, kind, content) =>
    ipcRenderer.invoke("tools:write-file", id, kind, content),
  listExtensions: (id) => ipcRenderer.invoke("tools:list-extensions", id),
  toggleSkill: (id, skillId, enabled) =>
    ipcRenderer.invoke("tools:toggle-skill", id, skillId, enabled),
  listSessions: (id) => ipcRenderer.invoke("tools:list-sessions", id),
  deleteSession: (id, sessionId) =>
    ipcRenderer.invoke("tools:delete-session", id, sessionId),
  openSessionLocation: (id, sessionId) =>
    ipcRenderer.invoke("tools:open-session", id, sessionId),
  openToolPath: (id, kind) =>
    ipcRenderer.invoke("tools:open-path", id, kind),
  listPrompts: (id) => ipcRenderer.invoke("prompts:list", id),
  savePrompt: (id, input) => ipcRenderer.invoke("prompts:save", id, input),
  deletePrompt: (id, promptId) =>
    ipcRenderer.invoke("prompts:delete", id, promptId),
  togglePrompt: (id, promptId, enabled) =>
    ipcRenderer.invoke("prompts:toggle", id, promptId, enabled),
  setPromptMode: (id, mode) =>
    ipcRenderer.invoke("prompts:set-mode", id, mode),
  syncPromptCatalog: (id) => ipcRenderer.invoke("prompts:sync", id),
  savePromptCategory: (id, previousName, nextName) =>
    ipcRenderer.invoke("prompts:save-category", id, previousName, nextName),
  deletePromptCategory: (id, name) =>
    ipcRenderer.invoke("prompts:delete-category", id, name),
  importPrompt: (id) => ipcRenderer.invoke("prompts:import", id),
  listProviders: (id) => ipcRenderer.invoke("providers:list", id),
  saveProvider: (id, input) => ipcRenderer.invoke("providers:save", id, input),
  duplicateProvider: (id, providerId) =>
    ipcRenderer.invoke("providers:duplicate", id, providerId),
  activateProvider: (id, providerId) =>
    ipcRenderer.invoke("providers:activate", id, providerId),
  deleteProvider: (id, providerId) =>
    ipcRenderer.invoke("providers:delete", id, providerId),
  testProvider: (id, providerId, model) =>
    ipcRenderer.invoke("providers:test", id, providerId, model),
  importProviderDatabase: (id) =>
    ipcRenderer.invoke("providers:import-database", id),
  setContextWindow: (id, enabled) =>
    ipcRenderer.invoke("providers:set-context-window", id, enabled),
  saveRouting: (id, settings) =>
    ipcRenderer.invoke("providers:save-routing", id, settings),
  getRouterStatus: (id) =>
    ipcRenderer.invoke("providers:router-status", id),
  resetRouterHealth: (id, providerId) =>
    ipcRenderer.invoke("providers:reset-health", id, providerId),
  toggleMcp: (id, name, enabled) =>
    ipcRenderer.invoke("tools:toggle-mcp", id, name, enabled),
  saveExtensionNote: (id, kind, extensionId, note) =>
    ipcRenderer.invoke("tools:save-extension-note", id, kind, extensionId, note),
  checkSkillUpdates: (id) =>
    ipcRenderer.invoke("tools:check-skill-updates", id),
  updateSkill: (id, skillId) =>
    ipcRenderer.invoke("tools:update-skill", id, skillId),
  installSkillZip: (id) => ipcRenderer.invoke("tools:install-skill", id),
  previewExistingWorkspace: (id) =>
    ipcRenderer.invoke("tools:preview-existing", id),
  importExistingWorkspace: (id, selection) =>
    ipcRenderer.invoke("tools:import-existing", id, selection),
  exportWorkspace: (id) => ipcRenderer.invoke("tools:export-workspace", id),
  deleteSessions: (id, sessionIds, permanent) =>
    ipcRenderer.invoke("tools:delete-sessions", id, sessionIds, permanent),
  exportSessions: (id, sessionIds) =>
    ipcRenderer.invoke("tools:export-sessions", id, sessionIds),
  getSessionStatus: (id) => ipcRenderer.invoke("tools:session-status", id),
  syncSessions: (id, sessionIds) =>
    ipcRenderer.invoke("tools:sync-sessions", id, sessionIds),
  exportSessionsMarkdown: (id, sessionIds) =>
    ipcRenderer.invoke("tools:export-sessions-markdown", id, sessionIds),
  listBackups: (id) => ipcRenderer.invoke("backups:list", id),
  restoreBackup: (id, backupId) =>
    ipcRenderer.invoke("backups:restore", id, backupId),
  runDiagnostics: (id) => ipcRenderer.invoke("diagnostics:run", id),
  checkConfigHealth: (id) => ipcRenderer.invoke("diagnostics:check-config", id),
  repairConfigHealth: (id, fingerprint) =>
    ipcRenderer.invoke("diagnostics:repair-config", id, fingerprint),
  checkForUpdate: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  openDownloads: () => ipcRenderer.invoke("updates:open-downloads"),
  getSystemInfo: () => ipcRenderer.invoke("system:info"),
  reportError: (error) => ipcRenderer.send("renderer:error", error),
});
