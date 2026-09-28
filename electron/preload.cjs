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
  getSystemInfo: () => ipcRenderer.invoke("system:info"),
  reportError: (error) => ipcRenderer.send("renderer:error", error),
});
