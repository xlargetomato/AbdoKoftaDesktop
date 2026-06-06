import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (html: string): Promise<boolean> =>
    ipcRenderer.invoke('print:receipt', html),
  deleteAuthUser: (uid: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('auth:delete-user', uid),
  resetAuthUserPassword: (uid: string, newPassword: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('auth:reset-password', uid, newPassword),

  // App version & control
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:get-version'),
  restartApp: (): Promise<void> =>
    ipcRenderer.invoke('app:restart'),
  getLicenseStatus: (): Promise<{
    valid: boolean
    reason?: string
    hwid: string
    licensePath: string
    license?: unknown
  }> => ipcRenderer.invoke('license:get-status'),
  createActivationRequest: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('license:create-activation-request'),
  importLicense: (): Promise<{ ok: boolean; status?: unknown; error?: string }> =>
    ipcRenderer.invoke('license:import-license'),
  getLocalStoreStatus: (): Promise<{ ok: boolean; path: string; pendingOutbox: number; error?: string }> =>
    ipcRenderer.invoke('local-store:get-status'),

  // Auto-updater
  updaterCheckNow: (): Promise<void> =>
    ipcRenderer.invoke('updater:check-now'),
  updaterStartDownload: (): Promise<void> =>
    ipcRenderer.invoke('updater:start-download'),
  updaterQuitAndInstall: (): Promise<void> =>
    ipcRenderer.invoke('updater:quit-and-install'),
  onUpdateAvailable: (
    cb: (info: { version: string; releaseNotes: string | null }) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { version: string; releaseNotes: string | null }): void => cb(info)
    ipcRenderer.on('updater:update-available', handler)
    return () => ipcRenderer.removeListener('updater:update-available', handler)
  },
  onDownloadProgress: (
    cb: (progress: { percent: number; transferred: number; total: number }) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: { percent: number; transferred: number; total: number }): void => cb(progress)
    ipcRenderer.on('updater:download-progress', handler)
    return () => ipcRenderer.removeListener('updater:download-progress', handler)
  },
  onUpdateDownloaded: (cb: (info: { version: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { version: string }): void => cb(info)
    ipcRenderer.on('updater:update-downloaded', handler)
    return () => ipcRenderer.removeListener('updater:update-downloaded', handler)
  },
  onUpdaterError: (cb: (err: { message: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, err: { message: string }): void => cb(err)
    ipcRenderer.on('updater:error', handler)
    return () => ipcRenderer.removeListener('updater:error', handler)
  },
  onUpdateUpToDate: (cb: (info: { latestVersion: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { latestVersion: string }): void => cb(info)
    ipcRenderer.on('updater:up-to-date', handler)
    return () => ipcRenderer.removeListener('updater:up-to-date', handler)
  }
})
