import { useEffect, useState, type FormEvent } from 'react'
import type { AppSettings } from '@shared/types'
import { getSettings, updateSettings } from '@renderer/features/orders/order-service'
import { applyThemeColor, DEFAULT_PRIMARY } from '@renderer/features/theme/theme-store'
import { MdSave, MdPalette } from 'react-icons/md'

// Preset colours the manager can pick from
const COLOR_PRESETS = [
  { label: 'فيروزي (افتراضي)', value: '#0e7490' },
  { label: 'برتقالي', value: '#b8430a' },
  { label: 'أزرق', value: '#1d4ed8' },
  { label: 'أخضر', value: '#15803d' },
  { label: 'بنفسجي', value: '#7c3aed' },
  { label: 'وردي', value: '#be185d' },
  { label: 'رمادي', value: '#374151' },
  { label: 'أحمر', value: '#b91c1c' }
]

export function SettingsPage(): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  // ── Receipt card state ──────────────────────────────────────────────────
  const [receiptForm, setReceiptForm] = useState({
    restaurantNameAr: '',
    currencySymbol: '',
    phoneNumber: '',
    receiptFooterAr: ''
  })
  const [receiptSaving, setReceiptSaving] = useState(false)
  const [receiptMsg, setReceiptMsg] = useState<string | null>(null)

  // ── Theme card state ────────────────────────────────────────────────────
  const [selectedColor, setSelectedColor] = useState(DEFAULT_PRIMARY)
  const [customColor, setCustomColor] = useState(DEFAULT_PRIMARY)
  const [themeSaving, setThemeSaving] = useState(false)
  const [themeMsg, setThemeMsg] = useState<string | null>(null)

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s)
      setReceiptForm({
        restaurantNameAr: s.restaurantNameAr,
        currencySymbol: s.currencySymbol,
        phoneNumber: s.phoneNumber ?? '',
        receiptFooterAr: s.receiptFooterAr ?? ''
      })
      const color = s.primaryColor ?? DEFAULT_PRIMARY
      setSelectedColor(color)
      setCustomColor(color)
    })
  }, [])

  async function handleReceiptSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    setReceiptSaving(true)
    setReceiptMsg(null)
    try {
      await updateSettings({
        restaurantNameAr: receiptForm.restaurantNameAr.trim(),
        currencySymbol: receiptForm.currencySymbol.trim(),
        phoneNumber: receiptForm.phoneNumber.trim() || undefined,
        receiptFooterAr: receiptForm.receiptFooterAr.trim() || undefined
      })
      setReceiptMsg('تم حفظ إعدادات الإيصال')
    } catch {
      setReceiptMsg('فشل الحفظ')
    } finally {
      setReceiptSaving(false)
    }
  }

  async function handleThemeSave(): Promise<void> {
    setThemeSaving(true)
    setThemeMsg(null)
    try {
      await updateSettings({ primaryColor: selectedColor })
      applyThemeColor(selectedColor)
      setThemeMsg('تم حفظ اللون')
    } catch {
      setThemeMsg('فشل الحفظ')
    } finally {
      setThemeSaving(false)
    }
  }

  function pickColor(hex: string): void {
    setSelectedColor(hex)
    setCustomColor(hex)
    applyThemeColor(hex) // live preview
  }

  if (!settings) return <p className="app-loading">جارٍ التحميل…</p>

  return (
    <div className="settings-page">

      {/* ── Receipt / Restaurant card ── */}
      <div className="card">
        <h2 className="card__title">تعديل الإيصال</h2>

        {receiptMsg && (
          <p className={`form-message ${receiptMsg.includes('فشل') ? 'form-message--error' : 'form-message--ok'}`} role="status">
            {receiptMsg}
          </p>
        )}

        <form onSubmit={(e) => void handleReceiptSave(e)}>
          <label className="field">
            <span>اسم المطعم (يظهر في الإيصال)</span>
            <input
              value={receiptForm.restaurantNameAr}
              onChange={(e) => setReceiptForm((f) => ({ ...f, restaurantNameAr: e.target.value }))}
              required
            />
          </label>

          <label className="field">
            <span>رمز العملة</span>
            <input
              value={receiptForm.currencySymbol}
              onChange={(e) => setReceiptForm((f) => ({ ...f, currencySymbol: e.target.value }))}
              placeholder="ج.م"
              required
              style={{ maxWidth: 120 }}
            />
          </label>

          <label className="field">
            <span>رقم الهاتف (يظهر في الإيصال)</span>
            <input
              value={receiptForm.phoneNumber}
              onChange={(e) => setReceiptForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              placeholder="01xxxxxxxxx"
              dir="ltr"
            />
          </label>

          <label className="field">
            <span>تذييل الإيصال (اختياري)</span>
            <textarea
              value={receiptForm.receiptFooterAr}
              onChange={(e) => setReceiptForm((f) => ({ ...f, receiptFooterAr: e.target.value }))}
              placeholder="شكراً لزيارتكم…"
              rows={2}
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={receiptSaving}>
              <MdSave aria-hidden="true" />
              {receiptSaving ? 'جارٍ الحفظ…' : 'حفظ الإيصال'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border-light)' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', margin: 0 }}>
            رقم الطلب التالي: <strong>{settings.nextOrderNumber}</strong>
          </p>
        </div>
      </div>

      {/* ── Theme card ── */}
      <div className="card">
        <h2 className="card__title">
          <MdPalette style={{ verticalAlign: 'middle', marginLeft: 6 }} />
          ألوان التطبيق
        </h2>

        {themeMsg && (
          <p className={`form-message ${themeMsg.includes('فشل') ? 'form-message--error' : 'form-message--ok'}`} role="status">
            {themeMsg}
          </p>
        )}

        <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: 16 }}>
          اختر اللون الرئيسي للتطبيق — يؤثر على الأزرار والعناصر النشطة والشريط الجانبي
        </p>

        {/* Preset swatches */}
        <div className="color-presets">
          {COLOR_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`color-swatch${selectedColor === p.value ? ' color-swatch--active' : ''}`}
              style={{ '--swatch-color': p.value } as React.CSSProperties}
              onClick={() => pickColor(p.value)}
              title={p.label}
              aria-label={p.label}
            />
          ))}
        </div>

        {/* Custom color picker */}
        <div className="field" style={{ marginTop: 16 }}>
          <span>لون مخصص</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="color"
              value={customColor}
              onChange={(e) => {
                setCustomColor(e.target.value)
                pickColor(e.target.value)
              }}
              style={{ width: 48, height: 40, padding: 2, border: '2px solid var(--color-border)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)', fontFamily: 'monospace' }}>
              {selectedColor}
            </span>
          </div>
        </div>

        {/* Live preview */}
        <div className="theme-preview">
          <div className="theme-preview__label">معاينة</div>
          <div className="theme-preview__bar" style={{ background: selectedColor }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn--primary btn--sm" style={{ pointerEvents: 'none' }}>زر رئيسي</button>
            <button type="button" className="btn btn--secondary btn--sm" style={{ pointerEvents: 'none' }}>ثانوي</button>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn--primary" onClick={() => void handleThemeSave()} disabled={themeSaving}>
            <MdSave aria-hidden="true" />
            {themeSaving ? 'جارٍ الحفظ…' : 'حفظ اللون'}
          </button>
          <button type="button" className="btn btn--secondary"
            onClick={() => pickColor(DEFAULT_PRIMARY)}>
            إعادة الافتراضي
          </button>
        </div>
      </div>

    </div>
  )
}
