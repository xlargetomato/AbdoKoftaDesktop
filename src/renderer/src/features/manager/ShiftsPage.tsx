import { useCallback, useEffect, useState } from 'react'
import type { Shift } from '@shared/types'
import {
  archiveShifts,
  closeShift,
  getShiftSummary,
  listShifts,
  unarchiveShifts,
  type ShiftSummary
} from '@renderer/features/shifts/shift-service'
import { useAuthStore } from '@renderer/features/auth/auth-store'
import { MdArchive, MdLock, MdRefresh, MdUnarchive } from 'react-icons/md'

type ShiftViewMode = 'active' | 'archived'

export function ShiftsPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user)!
  const [shifts, setShifts] = useState<Shift[]>([])
  const [viewMode, setViewMode] = useState<ShiftViewMode>('active')
  const [selected, setSelected] = useState<ShiftSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [counts, setCounts] = useState({ active: 0, archived: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    const allShifts = await listShifts(true)
    const activeShifts = allShifts.filter((s) => !s.archived)
    const archivedShifts = allShifts.filter((s) => !!s.archived)
    const data = viewMode === 'archived' ? archivedShifts : activeShifts
    setCounts({ active: activeShifts.length, archived: archivedShifts.length })
    setShifts(data)
    setLoading(false)

    if (selected && !data.some((s) => s.id === selected.shift.id)) {
      setSelected(null)
    } else if (!selected && data[0]) {
      setSelected(await getShiftSummary(data[0]))
    }
  }, [selected, viewMode])

  useEffect(() => { void load() }, [load])

  async function openSummary(shift: Shift): Promise<void> {
    setSelected(await getShiftSummary(shift))
  }

  async function handleClose(shift: Shift): Promise<void> {
    await closeShift(shift.id, user.id)
    setMessage('تم تقفيل الشيفت')
    await load()
  }

  async function handleArchive(shift: Shift): Promise<void> {
    await archiveShifts([shift.id])
    setMessage('تمت أرشفة الشيفت')
    setSelected(null)
    await load()
  }

  async function handleUnarchive(shift: Shift): Promise<void> {
    await unarchiveShifts([shift.id])
    setMessage('تم إلغاء أرشفة الشيفت')
    setSelected(null)
    await load()
  }

  if (loading) return <p className="app-loading">جاري التحميل...</p>

  return (
    <div className="shifts-page">
      {message && <p className="form-message form-message--ok">{message}</p>}
      <div className="card">
        <div className="reports-filter__options" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={`reports-filter__btn${viewMode === 'active' ? ' reports-filter__btn--active' : ''}`}
            onClick={() => { setViewMode('active'); setSelected(null) }}
          >
            الشيفتات النشطة ({counts.active})
          </button>
          <button
            type="button"
            className={`reports-filter__btn${viewMode === 'archived' ? ' reports-filter__btn--active' : ''}`}
            onClick={() => { setViewMode('archived'); setSelected(null) }}
          >
            الشيفتات المؤرشفة ({counts.archived})
          </button>
        </div>

        <h2 className="card__title">
          {viewMode === 'archived' ? 'الشيفتات المؤرشفة' : 'الشيفتات غير المؤرشفة'} ({shifts.length})
        </h2>

        <table className="data-table">
          <thead>
            <tr>
              <th>الكاشير</th>
              <th>الكود</th>
              <th>الحالة</th>
              <th>البداية</th>
              <th>النهاية</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                  لا توجد شيفتات في هذا القسم
                </td>
              </tr>
            ) : shifts.map((shift) => (
              <tr key={shift.id}>
                <td>{shift.cashierName}</td>
                <td dir="ltr">{shift.cashierCode ?? '--'}</td>
                <td>{shift.status === 'open' ? 'مفتوح' : 'مقفل'}</td>
                <td>{new Date(shift.openedAt).toLocaleString('ar-EG')}</td>
                <td>{shift.closedAt ? new Date(shift.closedAt).toLocaleString('ar-EG') : '-'}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => void openSummary(shift)}>
                      <MdRefresh /> عرض
                    </button>
                    {shift.status === 'open' && viewMode === 'active' && (
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleClose(shift)}>
                        <MdLock /> تقفيل
                      </button>
                    )}
                    {shift.status === 'closed' && (
                      viewMode === 'archived' ? (
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleUnarchive(shift)}>
                          <MdUnarchive /> إلغاء الأرشفة
                        </button>
                      ) : (
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleArchive(shift)}>
                          <MdArchive /> أرشفة
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card">
          <h2 className="card__title">ملخص شيفت {selected.shift.cashierName}</h2>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-card__label">إجمالي الإيراد</div><div className="stat-card__value">{selected.revenue.toFixed(2)}</div></div>
            <div className="stat-card"><div className="stat-card__label">فلوس الدرج</div><div className="stat-card__value">{selected.drawerTotal.toFixed(2)}</div></div>
            <div className="stat-card"><div className="stat-card__label">المصروفات</div><div className="stat-card__value">{selected.expenses.toFixed(2)}</div></div>
            <div className="stat-card"><div className="stat-card__label">طلبات مكتملة</div><div className="stat-card__value">{selected.completedOrders.length}</div></div>
            <div className="stat-card"><div className="stat-card__label">طلبات ملغية</div><div className="stat-card__value">{selected.cancelledOrders.length}</div></div>
            <div className="stat-card"><div className="stat-card__label">توريدات مخزون</div><div className="stat-card__value">{selected.suppliedInventory.length}</div></div>
          </div>
          <h3 className="section-title">الأوردرات الملغية</h3>
          <table className="data-table">
            <thead><tr><th>الأوردر</th><th>السبب</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {selected.cancelledOrders.map((o) => (
                <tr key={o.id}><td dir="ltr">{o.orderCode ?? o.orderNumber}</td><td>{o.cancelReasonAr ?? '-'}</td><td>{o.total.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
          <h3 className="section-title">المخزون المستخدم</h3>
          <table className="data-table">
            <thead><tr><th>المكوّن</th><th>الكمية</th><th>الوحدة</th></tr></thead>
            <tbody>
              {selected.usedInventory.map((tx) => (
                <tr key={tx.id}><td>{tx.ingredientId}</td><td>{tx.quantity.toFixed(2)}</td><td>{tx.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
