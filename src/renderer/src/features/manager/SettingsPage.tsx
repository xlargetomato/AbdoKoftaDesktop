import { useEffect, useState, type FormEvent } from 'react'
import type { AppSettings, DiningTable } from '@shared/types'
import { getSettings, updateSettings } from '@renderer/features/orders/order-service'
import { applyThemeColor, DEFAULT_PRIMARY } from '@renderer/features/theme/theme-store'
import { listUsersByRole, updateUserProfile } from '@renderer/features/auth/auth-service'
import { hashPin } from '@renderer/features/auth/pin-store'
import { listDiningTables, saveDiningTable, setDiningTableActive } from '@renderer/features/tables/table-service'
import { MdSave, MdPalette, MdLock, MdPerson, MdTableRestaurant } from 'react-icons/md'
import type { AppUser } from '@shared/types'

const COLOR_PRESETS = [
  { label: 'فيروزي (افتراضي)', value: '#0e7490' },
  { label: 'برتقالي',          value: '#b8430a' },
  { label: 'أزرق',             value: '#1d4ed8' },
  { label: 'أخضر',             value: '#15803d' },
  { label: 'بنفسجي',           value: '#7c3aed' },
  { label: 'وردي',             value: '#be185d' },
  { label: 'رمادي',            value: '#374151' },
  { label: 'أحمر',             value: '#b91c1c' }
]

const LOCK_OPTIONS = [
  { value: 0,   label: 'لا يُقفل تلقائياً' },
  { value: 1,   label: 'دقيقة واحدة' },
  { value: 5,   label: '٥ دقائق' },
  { value: 10,  label: '١٠ دقائق' },
  { value: 15,  label: '١٥ دقيقة' },
  { value: 30,  label: '٣٠ دقيقة' },
  { value: 60,  label: 'ساعة' }
]

export function SettingsPage(): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [cashiers, setCashiers] = useState<AppUser[]>([])
  const [tables, setTables] = useState<DiningTable[]>([])

  // ── Receipt ─────────────────────────────────────────────────────────────
  const [receiptForm, setReceiptForm] = useState({ restaurantNameAr: '', currencySymbol: '', phoneNumber: '', receiptFooterAr: '' })
  const [receiptSaving, setReceiptSaving] = useState(false)
  const [receiptMsg, setReceiptMsg] = useState<string | null>(null)

  // ── Theme ────────────────────────────────────────────────────────────────
  const [selectedColor, setSelectedColor] = useState(DEFAULT_PRIMARY)
  const [customColor, setCustomColor] = useState(DEFAULT_PRIMARY)
  const [themeSaving, setThemeSaving] = useState(false)
  const [themeMsg, setThemeMsg] = useState<string | null>(null)

  // ── PIN ──────────────────────────────────────────────────────────────────
  const [pinEnabled, setPinEnabled] = useState(false)
  const [autoLockMinutes, setAutoLockMinutes] = useState(5)
  const [pinSaving, setPinSaving] = useState(false)
  const [pinMsg, setPinMsg] = useState<string | null>(null)
  // Per-cashier PIN setting
  const [cashierPins, setCashierPins] = useState<Record<string, string>>({})
  const [pinSavingFor, setPinSavingFor] = useState<string | null>(null)
  const [tableForm, setTableForm] = useState({ id: '', nameAr: '', categoryAr: '', sortOrder: '0' })
  const [tableSaving, setTableSaving] = useState(false)
  const [tableMsg, setTableMsg] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([getSettings(), listUsersByRole('cashier'), listDiningTables(true)]).then(([s, c, t]) => {
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
      setPinEnabled(s.pinEnabled ?? false)
      setAutoLockMinutes(s.autoLockMinutes ?? 5)
      setCashiers(c)
      setTables(t)
    })
  }, [])

  // ── Receipt save ──────────────────────────────────────────────────────────
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
    } catch { setReceiptMsg('فشل الحفظ') }
    finally { setReceiptSaving(false) }
  }

  // ── Theme save ────────────────────────────────────────────────────────────
  async function handleThemeSave(): Promise<void> {
    setThemeSaving(true)
    setThemeMsg(null)
    try {
      await updateSettings({ primaryColor: selectedColor })
      applyThemeColor(selectedColor)
      setThemeMsg('تم حفظ اللون')
    } catch { setThemeMsg('فشل الحفظ') }
    finally { setThemeSaving(false) }
  }

  function pickColor(hex: string): void {
    setSelectedColor(hex); setCustomColor(hex); applyThemeColor(hex)
  }

  // ── PIN global save ───────────────────────────────────────────────────────
  async function handlePinSettingsSave(): Promise<void> {
    setPinSaving(true)
    setPinMsg(null)
    try {
      await updateSettings({ pinEnabled, autoLockMinutes })
      setPinMsg('تم حفظ إعدادات القفل')
    } catch { setPinMsg('فشل الحفظ') }
    finally { setPinSaving(false) }
  }

  // ── Per-cashier PIN save ──────────────────────────────────────────────────
  async function saveCashierPin(cashier: AppUser): Promise<void> {
    const pin = cashierPins[cashier.id] ?? ''
    if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
      setPinMsg('رمز PIN يجب أن يكون 4 أرقام')
      return
    }
    setPinSavingFor(cashier.id)
    try {
      const pinHash = pin ? await hashPin(pin) : undefined
      await updateUserProfile(cashier.id, { pinHash })
      setCashierPins((prev) => ({ ...prev, [cashier.id]: '' }))
      setPinMsg(`تم ${pin ? 'تعيين' : 'حذف'} PIN للكاشير ${cashier.displayName}`)
    } catch (e) { setPinMsg(e instanceof Error ? e.message : 'فشل') }
    finally { setPinSavingFor(null) }
  }

  async function reloadTables(): Promise<void> {
    setTables(await listDiningTables(true))
  }

  async function handleTableSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!tableForm.nameAr.trim()) return
    setTableSaving(true)
    setTableMsg(null)
    try {
      const existing = tables.find((table) => table.id === tableForm.id)
      await saveDiningTable({
        ...existing,
        id: tableForm.id || undefined,
        nameAr: tableForm.nameAr,
        categoryAr: tableForm.categoryAr || undefined,
        sortOrder: Number(tableForm.sortOrder) || 0,
        active: existing?.active ?? true
      })
      setTableForm({ id: '', nameAr: '', categoryAr: '', sortOrder: '0' })
      setTableMsg('تم حفظ الترابيزة')
      await reloadTables()
    } catch (e) {
      setTableMsg(e instanceof Error ? e.message : 'فشل حفظ الترابيزة')
    } finally {
      setTableSaving(false)
    }
  }

  function editTable(table: DiningTable): void {
    setTableForm({
      id: table.id,
      nameAr: table.nameAr,
      categoryAr: table.categoryAr ?? '',
      sortOrder: String(table.sortOrder)
    })
  }
  if (!settings) return <p className="app-loading">جارٍ التحميل…</p>

  return (
    <div className="settings-page">

      {/* ── Receipt card ── */}
      <div className="card">
        <h2 className="card__title">تعديل الإيصال</h2>
        {receiptMsg && <p className={`form-message ${receiptMsg.includes('فشل') ? 'form-message--error' : 'form-message--ok'}`}>{receiptMsg}</p>}
        <form onSubmit={(e) => void handleReceiptSave(e)}>
          <label className="field">
            <span>اسم المطعم</span>
            <input value={receiptForm.restaurantNameAr} onChange={(e) => setReceiptForm((f) => ({ ...f, restaurantNameAr: e.target.value }))} required />
          </label>
          <label className="field">
            <span>رمز العملة</span>
            <input value={receiptForm.currencySymbol} onChange={(e) => setReceiptForm((f) => ({ ...f, currencySymbol: e.target.value }))} placeholder="ج.م" required style={{ maxWidth: 120 }} />
          </label>
          <label className="field">
            <span>رقم الهاتف</span>
            <input value={receiptForm.phoneNumber} onChange={(e) => setReceiptForm((f) => ({ ...f, phoneNumber: e.target.value }))} placeholder="01xxxxxxxxx" dir="ltr" />
          </label>
          <label className="field">
            <span>تذييل الإيصال</span>
            <textarea value={receiptForm.receiptFooterAr} onChange={(e) => setReceiptForm((f) => ({ ...f, receiptFooterAr: e.target.value }))} placeholder="شكراً لزيارتكم…" rows={2} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={receiptSaving}>
              <MdSave /> {receiptSaving ? 'جارٍ الحفظ…' : 'حفظ الإيصال'}
            </button>
          </div>
        </form>
      </div>

      <div className="card settings-page__full">
        <h2 className="card__title"><MdTableRestaurant style={{ verticalAlign: 'middle', marginLeft: 6 }} />ترابيزات الصالة</h2>
        {tableMsg && <p className={`form-message ${tableMsg.includes('فشل') ? 'form-message--error' : 'form-message--ok'}`}>{tableMsg}</p>}
        <form className="table-manager-form" onSubmit={(e) => void handleTableSave(e)}>
          <label className="field">
            <span>اسم / رقم الترابيزة</span>
            <input value={tableForm.nameAr} onChange={(e) => setTableForm((f) => ({ ...f, nameAr: e.target.value }))} placeholder="مثال: 1 أو VIP" required />
          </label>
          <label className="field">
            <span>التصنيف</span>
            <input value={tableForm.categoryAr} onChange={(e) => setTableForm((f) => ({ ...f, categoryAr: e.target.value }))} placeholder="داخلي / خارجي" />
          </label>
          <label className="field">
            <span>الترتيب</span>
            <input type="number" value={tableForm.sortOrder} onChange={(e) => setTableForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          </label>
          <div className="form-actions table-manager-form__actions">
            <button type="submit" className="btn btn--primary" disabled={tableSaving}>
              <MdSave /> {tableSaving ? 'جارٍ الحفظ...' : tableForm.id ? 'تحديث الترابيزة' : 'إضافة ترابيزة'}
            </button>
            {tableForm.id && (
              <button type="button" className="btn btn--secondary" onClick={() => setTableForm({ id: '', nameAr: '', categoryAr: '', sortOrder: '0' })}>
                إلغاء التعديل
              </button>
            )}
          </div>
        </form>
        <div className="table-manager-list">
          {tables.length === 0 ? (
            <p className="report-empty">لا توجد ترابيزات بعد</p>
          ) : (
            tables.map((table) => (
              <div key={table.id} className={`table-manager-row${!table.active ? ' table-manager-row--inactive' : ''}`}>
                <div>
                  <strong>{table.nameAr}</strong>
                  <span>{table.categoryAr || 'بدون تصنيف'} - ترتيب {table.sortOrder}</span>
                </div>
                <div className="table-actions">
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => editTable(table)}>تعديل</button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={async () => { await setDiningTableActive(table.id, !table.active); await reloadTables() }}
                  >
                    {table.active ? 'إخفاء' : 'تفعيل'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {/* ── Theme card ── */}
      <div className="card">
        <h2 className="card__title"><MdPalette style={{ verticalAlign: 'middle', marginLeft: 6 }} />ألوان التطبيق</h2>
        {themeMsg && <p className={`form-message ${themeMsg.includes('فشل') ? 'form-message--error' : 'form-message--ok'}`}>{themeMsg}</p>}
        <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: 16 }}>اختر اللون الرئيسي للتطبيق</p>
        <div className="color-presets">
          {COLOR_PRESETS.map((p) => (
            <button key={p.value} type="button"
              className={`color-swatch${selectedColor === p.value ? ' color-swatch--active' : ''}`}
              style={{ '--swatch-color': p.value } as React.CSSProperties}
              onClick={() => pickColor(p.value)} title={p.label} aria-label={p.label} />
          ))}
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <span>لون مخصص</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="color" value={customColor}
              onChange={(e) => { setCustomColor(e.target.value); pickColor(e.target.value) }}
              style={{ width: 48, height: 40, padding: 2, border: '2px solid var(--color-border)', cursor: 'pointer' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)', fontFamily: 'monospace' }}>{selectedColor}</span>
          </div>
        </div>
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
            <MdSave /> {themeSaving ? 'جارٍ الحفظ…' : 'حفظ اللون'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => pickColor(DEFAULT_PRIMARY)}>إعادة الافتراضي</button>
        </div>
      </div>

      {/* ── PIN / Auto-lock card (full width) ── */}
      <div className="card settings-page__full">
        <h2 className="card__title"><MdLock style={{ verticalAlign: 'middle', marginLeft: 6 }} />قفل الشاشة بـ PIN</h2>

        {pinMsg && <p className={`form-message ${pinMsg.includes('فشل') || pinMsg.includes('يجب') ? 'form-message--error' : 'form-message--ok'}`}>{pinMsg}</p>}

        {/* Global toggle */}
        <div className="pin-settings-row">
          <label className="pin-toggle-label">
            <input type="checkbox" className="pin-toggle-checkbox"
              checked={pinEnabled}
              onChange={(e) => setPinEnabled(e.target.checked)} />
            <span className="pin-toggle-text">تفعيل قفل PIN للكاشيرات</span>
          </label>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            عند التفعيل يحتاج الكاشير إلى PIN شخصي للدخول بعد فترة الخمول
          </p>
        </div>

        {/* Auto-lock timeout */}
        <label className="field" style={{ maxWidth: 260, marginTop: 12 }}>
          <span>قفل تلقائي بعد</span>
          <select value={autoLockMinutes} onChange={(e) => setAutoLockMinutes(Number(e.target.value))}>
            {LOCK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn--primary" onClick={() => void handlePinSettingsSave()} disabled={pinSaving}>
            <MdSave /> {pinSaving ? 'جارٍ الحفظ…' : 'حفظ إعدادات القفل'}
          </button>
        </div>

        {/* Per-cashier PIN assignment */}
        {cashiers.length > 0 && (
          <>
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '2px solid var(--color-border)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                تعيين PIN لكل كاشير
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', margin: '0 0 16px' }}>
                اترك الحقل فارغاً لحذف PIN الكاشير. رمز PIN يجب أن يكون 4 أرقام.
              </p>
              <div className="pin-cashier-list">
                {cashiers.map((c) => (
                  <div key={c.id} className="pin-cashier-row">
                    <div className="pin-cashier-info">
                      <MdPerson aria-hidden="true" />
                      <span className="pin-cashier-name">{c.displayName}</span>
                      <span className="pin-cashier-username">@{c.username || c.email.split('@')[0]}</span>
                      {c.pinHash && (
                        <span className="pin-cashier-badge">PIN مُعيَّن ✓</span>
                      )}
                    </div>
                    <div className="pin-cashier-input-row">
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="----"
                        dir="ltr"
                        value={cashierPins[c.id] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                          setCashierPins((prev) => ({ ...prev, [c.id]: v }))
                        }}
                        className="inline-edit-input"
                        style={{ width: 80, textAlign: 'center', letterSpacing: '0.3em' }}
                      />
                      <button type="button" className="btn btn--primary btn--sm"
                        onClick={() => void saveCashierPin(c)}
                        disabled={pinSavingFor === c.id}>
                        {pinSavingFor === c.id ? '...' : 'حفظ PIN'}
                      </button>
                      {c.pinHash && (
                        <button type="button" className="btn btn--danger btn--sm"
                          onClick={async () => {
                            await updateUserProfile(c.id, { pinHash: undefined })
                            setPinMsg(`تم حذف PIN للكاشير ${c.displayName}`)
                            const updated = await listUsersByRole('cashier')
                            setCashiers(updated)
                          }}>
                          حذف PIN
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  )
}
