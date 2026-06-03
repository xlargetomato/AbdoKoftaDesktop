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
    title: 'عبده كفتة - نقطة البيع',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) {
      toggleDevTools(mainWindow)
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

import { deleteAuthUser } from './firebase-admin'
import { initAutoUpdater } from './auto-updater'

app.whenReady().then(() => {
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  ipcMain.handle('print:receipt', async (_, html: string) => {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    )
    return new Promise<boolean>((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (success) => {
          printWindow.close()
          resolve(success)
        }
      )
    })
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

  createWindow()

  // Start checking for updates (only in production builds)
  if (!isDev) {
    // Wait for window to be ready before sending IPC events
    const checkAfterReady = (): void => {
      initAutoUpdater()
    }
    if (mainWindow) {
      mainWindow.webContents.once('did-finish-load', checkAfterReady)
    } else {
      app.once('browser-window-created', (_, win) => {
        win.webContents.once('did-finish-load', checkAfterReady)
      })
    }
  }

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
