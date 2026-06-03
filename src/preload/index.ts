import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (html: string): Promise<boolean> =>
    ipcRenderer.invoke('print:receipt', html),
  deleteAuthUser: (uid: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('auth:delete-user', uid),

  // Auto-updater
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
  }
})
