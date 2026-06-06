import { useState } from 'react'

interface LicenseActivationPageProps {
  status: {
    valid: boolean
    reason?: string
    hwid: string
    licensePath: string
  }
  onActivated: () => void
}

export function LicenseActivationPage({
  status,
  onActivated
}: LicenseActivationPageProps): React.ReactElement {
  const [message, setMessage] = useState(status.reason ?? 'التطبيق يحتاج إلى تفعيل')
  const [busy, setBusy] = useState(false)

  async function createRequest(): Promise<void> {
    setBusy(true)
    try {
      const result = await window.electronAPI.createActivationRequest()
      setMessage(result.ok && result.path
        ? `تم حفظ طلب التفعيل: ${result.path}`
        : result.error ?? 'لم يتم إنشاء طلب التفعيل')
    } finally {
      setBusy(false)
    }
  }

  async function importLicense(): Promise<void> {
    setBusy(true)
    try {
      const result = await window.electronAPI.importLicense()
      if (result.ok && result.status?.valid) {
        setMessage('تم التفعيل بنجاح')
        onActivated()
      } else {
        setMessage(result.status?.reason ?? result.error ?? 'ملف الرخصة غير صالح')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="license-page" dir="rtl">
      <section className="license-panel">
        <h1>تفعيل التطبيق</h1>
        <p className="license-panel__message">{message}</p>
        <div className="license-panel__meta">
          <span>معرّف الجهاز</span>
          <code dir="ltr">{status.hwid}</code>
        </div>
        <div className="license-panel__meta">
          <span>مكان الرخصة</span>
          <code dir="ltr">{status.licensePath}</code>
        </div>
        <div className="license-panel__actions">
          <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => void createRequest()}>
            إنشاء activation_request.dat
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void importLicense()}>
            استيراد license.dat
          </button>
        </div>
      </section>
    </main>
  )
}
