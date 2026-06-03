import { ipcMain, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
type UpdateInfo = import('electron-updater').UpdateInfo

/**
 * Flow:
 * 1. On startup → check GitHub for latest.yml (silent)
 * 2. If update found → notify renderer (shows banner)
 * 3. User clicks "تحميل التحديث" → main starts download
 * 4. Download progress → forwarded to renderer (progress bar)
 * 5. Download done → notify renderer (shows "restart" button)
 * 6. User clicks "إعادة التشغيل" → quitAndInstall()
 */

function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

function send(channel: string, payload?: unknown): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

export function initAutoUpdater(): void {
  // Don't auto-download — wait for user confirmation
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Silence updater logger in production (set to debug in dev if needed)
  autoUpdater.logger = null

  // ── Events ──────────────────────────────────────────────────────────────

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes ?? null
    })
  })

  autoUpdater.on('update-not-available', () => {
    // silently ignore — no UI needed
  })

  autoUpdater.on('download-progress', (progress) => {
    send('updater:download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    send('updater:update-downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    send('updater:error', { message: err.message })
  })

  // ── IPC handlers ────────────────────────────────────────────────────────

  // Renderer asks to start download
  ipcMain.handle('updater:start-download', async () => {
    try {
      await autoUpdater.downloadUpdate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      send('updater:error', { message: msg })
    }
  })

  // Renderer asks to quit and install
  ipcMain.handle('updater:quit-and-install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Check for updates (called after window is ready)
  autoUpdater.checkForUpdates().catch((err: Error) => {
    // Network unavailable or GitHub unreachable — fail silently
    console.warn('[updater] check failed:', err.message)
  })
}
