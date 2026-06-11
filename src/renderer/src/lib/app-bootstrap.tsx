import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App'
import { LicenseActivationPage } from '@renderer/features/license/LicenseActivationPage'

export async function bootstrapApp(): Promise<void> {
  const rootEl = document.getElementById('root')!
  const root = createRoot(rootEl)

  // License check — must pass before the app loads
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

  // SQLite is the primary database — no Firebase initialisation required at boot.
  // Firebase is initialised lazily by the background upload service when online.
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
