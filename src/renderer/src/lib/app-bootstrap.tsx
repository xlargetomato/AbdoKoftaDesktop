import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App'

function showBootstrapError(message: string): void {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `<div class="app-loading"><p>${message}</p><p style="margin-top:1rem;font-size:0.9rem">تأكد من وجود .env.local ثم أعد البناء: npm run dist:win</p></div>`
}

export async function bootstrapApp(): Promise<void> {
  const rootEl = document.getElementById('root')!
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
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
