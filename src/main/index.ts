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
    title: 'SHIFT POS',
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

import {
  deleteAuthUser,
  ensureAuthUser,
  readAdminDocument,
  resetAuthUserPassword,
  writeAdminDocument
} from './firebase-admin'
import { initAutoUpdater } from './auto-updater'
import {
  createActivationRequestFile,
  getLicenseStatus,
  importLicenseFile,
  isDevBypassActive,
  toggleDevLicense,
  activateMasterKey
} from './license'
import {
  cacheDocuments,
  countPendingOutbox,
  deleteCachedDocument,
  enqueueOutbox,
  executeBatch,
  backupDatabase,
  restoreDatabase,
  readIngredientStocks,
  getLocalStoreStatus,
  initLocalStore,
  markOutboxFailed,
  markOutboxSynced,
  readCachedDocument,
  readCachedDocuments,
  readPendingOutbox,
  resetDatabase,
  resetFailedOutbox
} from './local-store'

app.whenReady().then(() => {
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  // Init updater in both dev and prod
  // (forceDevUpdateConfig handles the dev case via dev-app-update.yml)
  initAutoUpdater()
  initLocalStore()

  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('license:get-status', () => getLicenseStatus())
  ipcMain.handle('license:create-activation-request', () => createActivationRequestFile())
  ipcMain.handle('license:import-license', () => importLicenseFile())
  ipcMain.handle('license:activate-master-key', (_event, key: string) => {
    return activateMasterKey(key)
  })
  ipcMain.handle('local-store:get-status', () => getLocalStoreStatus())
  ipcMain.handle('local-cache:set-documents', (_, collectionName: string, documents: Array<{ id: string; data: unknown }>) => {
    cacheDocuments(collectionName, documents)
    return { ok: true as const }
  })
  ipcMain.handle('local-cache:get-documents', (_, collectionName: string) =>
    readCachedDocuments(collectionName)
  )
  ipcMain.handle('local-cache:get-document', (_, collectionName: string, documentId: string) =>
    readCachedDocument(collectionName, documentId)
  )

  // SQLite primary database: delete a single document
  ipcMain.handle('local-cache:delete-document', (_, collectionName: string, documentId: string) => {
    const deleted = deleteCachedDocument(collectionName, documentId)
    return { ok: true as const, deleted }
  })

  // SQLite atomic batch write — all ops in one transaction
  ipcMain.handle('local-cache:execute-batch', (_, operations: Array<{ collection: string; id: string; data: unknown; op: 'set' | 'delete' }>) => {
    return executeBatch(operations)
  })

  // Materialized stock reads — REQ-11
  ipcMain.handle('local-store:get-stocks', () => readIngredientStocks())

  // Database backup — copy SQLite file to user-chosen location
  ipcMain.handle('local-store:backup', async () => {    const { dialog } = await import('electron')
    const today = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog({
      title: 'حفظ نسخة احتياطية',
      defaultPath: `shift-pos-backup-${today}.sqlite`,
      filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, error: 'تم الإلغاء' }
    return backupDatabase(result.filePath)
  })

  // Database restore — pick a backup file and replace the current DB
  ipcMain.handle('local-store:restore', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      title: 'اختيار ملف النسخة الاحتياطية',
      filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'تم الإلغاء' }
    return restoreDatabase(result.filePaths[0]!)
  })

  // Sync outbox: read pending entries for Firebase background upload
  ipcMain.handle('outbox:get-pending', () => {
    return readPendingOutbox()
  })

  // Sync outbox: enqueue a document for Firebase upload
  ipcMain.handle('outbox:enqueue', (_, entityType: string, entityId: string, operation: 'set' | 'delete', payload: unknown) => {
    enqueueOutbox(entityType, entityId, operation, payload)
    return { ok: true as const }
  })

  // Sync outbox: mark entries synced
  ipcMain.handle('outbox:mark-synced', (_, ids: string[]) => {
    markOutboxSynced(ids)
    return { ok: true as const }
  })

  // Sync outbox: mark entries failed
  ipcMain.handle('outbox:mark-failed', (_, ids: string[]) => {
    markOutboxFailed(ids)
    return { ok: true as const }
  })

  // Sync outbox: reset failed entries for retry
  ipcMain.handle('outbox:reset-failed', () => {
    resetFailedOutbox()
    return { ok: true as const }
  })

  // Sync outbox: count pending
  ipcMain.handle('outbox:count-pending', () => {
    return { count: countPendingOutbox() }
  })

  // DEV ONLY — wipe all SQLite data so the app boots as fresh
  ipcMain.handle('dev:reset-database', () => {
    return resetDatabase()
  })

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

  ipcMain.handle('auth:ensure-user', async (_, params: { uid: string; email: string; password: string; displayName: string }) => {
    try {
      await ensureAuthUser(params)
      return { ok: true as const }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle('admin:get-document', async (_, collectionName: string, documentId: string) => {
    try {
      return { ok: true as const, data: await readAdminDocument(collectionName, documentId) }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle('admin:set-document', async (_, collectionName: string, documentId: string, data: unknown) => {
    try {
      await writeAdminDocument(collectionName, documentId, data)
      return { ok: true as const }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: message }
    }
  })

  createWindow()

  if (isDev) {
    // Helper — injects a small toast into the renderer window
    function devToast(bg: string, text: string): string {
      return `(function(){
        window.__devToast && clearTimeout(window.__devToast);
        const el = document.createElement('div');
        el.style.cssText =
          'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
          'background:${bg};color:#fff;padding:10px 22px;border-radius:8px;' +
          'font-size:14px;z-index:99999;font-family:sans-serif;' +
          'box-shadow:0 4px 14px rgba(0,0,0,.45);pointer-events:none;white-space:nowrap;';
        el.textContent = ${JSON.stringify(text)};
        document.body.appendChild(el);
        window.__devToast = setTimeout(() => el.remove(), 3500);
      })()`
    }

    // Regular devtools shortcuts
    for (const accel of ['CommandOrControl+Shift+I', 'CommandOrControl+Shift+D', 'F12']) {
      globalShortcut.register(accel, () => {
        toggleDevTools(BrowserWindow.getFocusedWindow() ?? mainWindow)
      })
    }

    // -----------------------------------------------------------------------
    // Ctrl+Shift+1 arms the dev menu for 2 s, then:
    //   → Ctrl+Shift+P  toggle license bypass (activate / deactivate)
    //   → Ctrl+Shift+R  wipe SQLite database   (fresh first-run state)
    // -----------------------------------------------------------------------
    let devArmed = false
    let devTimer: ReturnType<typeof setTimeout> | null = null

    function armDev(): void {
      devArmed = true
      if (devTimer) clearTimeout(devTimer)
      devTimer = setTimeout(() => { devArmed = false; devTimer = null }, 2000)
      console.log('[dev] armed — Ctrl+Shift+P = toggle license | Ctrl+Shift+R = reset DB')
    }

    function disarmDev(): void {
      devArmed = false
      if (devTimer) { clearTimeout(devTimer); devTimer = null }
    }

    globalShortcut.register('CommandOrControl+Shift+1', armDev)

    // Toggle license bypass
    globalShortcut.register('CommandOrControl+Shift+P', () => {
      if (!devArmed) return
      disarmDev()
      const wasActive = isDevBypassActive()
      console.log('[dev-license]', toggleDevLicense())
      const win = BrowserWindow.getFocusedWindow() ?? mainWindow
      win?.webContents.executeJavaScript(devToast(
        wasActive ? '#c0392b' : '#27ae60',
        wasActive ? '🔴 License OFF — restart app' : '🟢 License ON — restart app'
      )).catch(() => {})
    })

    // Wipe SQLite database
    globalShortcut.register('CommandOrControl+Shift+R', () => {
      if (!devArmed) return
      disarmDev()
      const result = resetDatabase()
      console.log('[dev-reset]', result.ok ? 'Database wiped' : result.error)
      const win = BrowserWindow.getFocusedWindow() ?? mainWindow
      if (win) {
        // Also clear renderer localStorage (auth cache, session, etc.)
        if (result.ok) {
          win.webContents.executeJavaScript('localStorage.clear()').catch(() => {})
        }
        win.webContents.executeJavaScript(devToast(
          result.ok ? '#2980b9' : '#c0392b',
          result.ok
            ? '🗑️ DB wiped — restart app to register fresh'
            : `❌ Reset failed: ${result.error}`
        )).catch(() => {})
      }
    })
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
