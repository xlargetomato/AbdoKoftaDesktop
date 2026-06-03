export interface ElectronAPI {
  // Receipt printing
  printReceipt: (html: string) => Promise<boolean>
  // Auth admin
  deleteAuthUser: (uid: string) => Promise<{ ok: boolean; error?: string }>

  // Auto-updater — actions
  updaterStartDownload: () => Promise<void>
  updaterQuitAndInstall: () => Promise<void>

  // Auto-updater — event subscriptions (return an unsubscribe fn)
  onUpdateAvailable: (
    cb: (info: { version: string; releaseNotes: string | null }) => void
  ) => () => void
  onDownloadProgress: (
    cb: (progress: { percent: number; transferred: number; total: number }) => void
  ) => () => void
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void
  onUpdaterError: (cb: (err: { message: string }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
