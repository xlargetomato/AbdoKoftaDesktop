export interface ElectronAPI {
  // Receipt printing
  printReceipt: (html: string) => Promise<boolean>
  // Auth admin
  deleteAuthUser: (uid: string) => Promise<{ ok: boolean; error?: string }>
  resetAuthUserPassword: (uid: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>

  // App version & control
  getAppVersion: () => Promise<string>
  restartApp: () => Promise<void>
  getLicenseStatus: () => Promise<{
    valid: boolean
    reason?: string
    hwid: string
    licensePath: string
    license?: {
      licenseId: string
      customerName?: string
      storeName?: string
      issuedAt: number
      expiresAt?: number
    }
  }>
  createActivationRequest: () => Promise<{ ok: boolean; path?: string; error?: string }>
  importLicense: () => Promise<{
    ok: boolean
    status?: { valid: boolean; reason?: string }
    error?: string
  }>
  getLocalStoreStatus: () => Promise<{
    ok: boolean
    path: string
    pendingOutbox: number
    error?: string
  }>

  // Auto-updater — actions
  updaterCheckNow: () => Promise<void>
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
  onUpdateUpToDate: (cb: (info: { latestVersion: string }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
