/**
 * Audit Log — REQ-7
 * Read-only view of all system actions. Manager access only.
 */
import { useEffect, useState } from 'react'
import { listAuditEntries, type AuditDateRange } from '@renderer/features/audit/audit-service'
import type { AuditEntry, AuditAction } from '@shared/types'

const RANGE_OPTIONS: { value: AuditDateRange; label: string }[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week',  label: 'آخر ٧ أيام' },
  { value: 'month', label: 'آخر ٣٠ يوم' },
  { value: 'all',   label: 'كل السجل' }
]

const ACTION_LABELS: Record<AuditAction, string> = {
  login:                     'تسجيل دخول',
  logout:                    'تسجيل خروج',
  order_cancelled:           'إلغاء طلب',
  discount_applied:          'خصم مُطبَّق',
  manager_override_discount: 'تجاوز خصم بموافقة مدير',
  order_refunded:            'استرداد طلب',
  account_created:           'إنشاء حساب',
  account_deactivated:       'تعديل حالة حساب',
  account_deleted:           'حذف حساب',
  settings_changed:          'تغيير إعدادات',
  shift_opened:              'فتح شيفت',
  shift_closed:              'إغلاق شيفت',
  cash_in:                   'إضافة نقدية',
  cash_out:                  'سحب نقدي'
}

const ACTION_BADGE: Record<AuditAction, string> = {
  login:                     'badge--info',
  logout:                    'badge--muted',
  order_cancelled:           'badge--danger',
  discount_applied:          'badge--warning',
  manager_override_discount: 'badge--warning',
  order_refunded:            'badge--danger',
  account_created:           'badge--success',
  account_deactivated:       'badge--warning',
  account_deleted:           'badge--danger',
  settings_changed:          'badge--info',
  shift_opened:              'badge--success',
  shift_closed:              'badge--muted',
  cash_in:                   'badge--success',
  cash_out:                  'badge--warning'
}

export function AuditLogPage(): React.ReactElement {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [range, setRange] = useState<AuditDateRange>('today')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    void listAuditEntries(range).then((data) => {
      setEntries(data)
      setLoading(false)
    })
  }, [range])

  const filtered = search.trim()
    ? entries.filter(
        (e) =>
          e.actorName.includes(search) ||
          e.detailAr.includes(search) ||
          ACTION_LABELS[e.action].includes(search)
      )
    : entries

  return (
    <div className="unified-page">
      <div className="page-toolbar" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        {/* Date range filter */}
        <div className="reports-filter__options">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`reports-filter__btn${range === opt.value ? ' reports-filter__btn--active' : ''}`}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* Search */}
        <input
          className="pos-search"
          style={{ maxWidth: 260, flex: 1 }}
          placeholder="بحث في الأحداث..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="card__title" style={{ margin: 0 }}>سجل الأحداث</h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>
            {filtered.length} حدث
          </span>
        </div>

        {loading ? (
          <p className="app-loading">جارٍ التحميل…</p>
        ) : filtered.length === 0 ? (
          <p className="report-empty">لا توجد أحداث في هذه الفترة</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>المستخدم</th>
                  <th>الحدث</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--color-muted)' }}>
                      {new Date(entry.createdAt).toLocaleString('ar-EG')}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {entry.actorName}
                    </td>
                    <td>
                      <span
                        className={`role-badge ${ACTION_BADGE[entry.action] ?? 'badge--info'}`}
                        style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: 12, display: 'inline-block' }}
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-muted)', maxWidth: 320, wordBreak: 'break-word' }}>
                      {entry.detailAr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
