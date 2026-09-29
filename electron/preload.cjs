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
  checkForUpdate: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  openDownloads: () => ipcRenderer.invoke("updates:open-downloads"),
  getSystemInfo: () => ipcRenderer.invoke("system:info"),
  reportError: (error) => ipcRenderer.send("renderer:error", error),
});
