import { app, BrowserWindow, ipcMain, globalShortcut, Menu } from 'electron'
import { join } from 'path'

/** True only for `npm run dev` (electron-vite), not for installer or preview builds */
const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])

let mainWindow: BrowserWindow | null = null

function toggleDevTools(win: BrowserWindow | null = mainWindow): void {
  if (!isDev || !win) return
  if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools()
  } else {
    win.webContents.openDevTools({ mode: 'detach', activate: true })
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'عبده كفتة',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach', activate: false })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[did-fail-load]', errorCode, errorDescription, validatedURL)
    }
  )

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

import { deleteAuthUser, resetAuthUserPassword } from './firebase-admin'
import { initAutoUpdater } from './auto-updater'

app.whenReady().then(() => {
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  // Init updater in both dev and prod
  // (forceDevUpdateConfig handles the dev case via dev-app-update.yml)
  initAutoUpdater()

  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('app:restart', () => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('print:receipt', async (_, html: string) => {
    const printWindow = new BrowserWindow({
      width: 380,
      height: 600,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    try {
      await printWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
      )

      // Wait for content to fully render before printing
      await new Promise<void>((resolve) => setTimeout(resolve, 500))

      return await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          if (!printWindow.isDestroyed()) printWindow.close()
          resolve(false)
        }, 30000)

        printWindow.webContents.print(
          {
            silent: false,
            printBackground: true,
            pageSize: { width: 80000, height: 297000 } // 80mm receipt width in microns
          },
          (success) => {
            clearTimeout(timeout)
            if (!printWindow.isDestroyed()) printWindow.close()
            resolve(success)
          }
        )
      })
    } catch (e) {
      console.error('[print]', e)
      if (!printWindow.isDestroyed()) printWindow.close()
      return false
    }
  })

  ipcMain.handle('auth:delete-user', async (_, uid: string) => {
    try {
      await deleteAuthUser(uid)
      return { ok: true as const }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle('auth:reset-password', async (_, uid: string, newPassword: string) => {
    try {
      await resetAuthUserPassword(uid, newPassword)
      return { ok: true as const }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: message }
    }
  })

  createWindow()

  if (isDev) {
    const shortcuts = [
      'F12',
      'CommandOrControl+Shift+I',
      'CommandOrControl+Shift+D'
    ]
    for (const accel of shortcuts) {
      globalShortcut.register(accel, () => {
        toggleDevTools(BrowserWindow.getFocusedWindow() ?? mainWindow)
      })
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
