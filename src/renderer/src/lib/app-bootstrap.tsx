import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App'
import { LicenseActivationPage } from '@renderer/features/license/LicenseActivationPage'

function showBootstrapError(message: string): void {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `<div class="app-loading"><p>${message}</p><p style="margin-top:1rem;font-size:0.9rem">تأكد من وجود .env.local ثم أعد البناء: npm run dist:win</p></div>`
}

export async function bootstrapApp(): Promise<void> {
  const rootEl = document.getElementById('root')!
  const root = createRoot(rootEl)
  const licenseStatus = await window.electronAPI.getLicenseStatus()
  if (!licenseStatus.valid) {
    root.render(
      <StrictMode>
        <LicenseActivationPage
          status={licenseStatus}
          onActivated={() => window.location.reload()}
        />
      </StrictMode>
    )
    return
  }
  try {
    const { enableOfflinePersistence } = await import('@renderer/lib/firebase')
    await enableOfflinePersistence()
  } catch (e) {
    const message =
      e instanceof Error ? e.message : 'فشل تحميل التطبيق'
    console.error('[bootstrap]', e)
    showBootstrapError(message)
    return
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
