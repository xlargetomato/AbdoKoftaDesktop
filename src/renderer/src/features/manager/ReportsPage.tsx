import { useEffect, useState } from 'react'
import {
  getFullReport,
  type ReportData
} from '@renderer/features/reports/reports-service'

type Tab = 'daily' | 'items' | 'cashiers'

export function ReportsPage(): React.ReactElement {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('daily')

  useEffect(() => {
    setLoading(true)
    void getFullReport().then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <p className="app-loading">جارٍ تحميل التقارير…</p>
  }

  if (!data) return <></>

  const { summary, daily, topItems, cashiers } = data
  const cur = 'ج.م'

  return (
    <div className="reports-page">

      {/* ── Summary cards ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__label">إجمالي الطلبات</div>
          <div className="stat-card__value">{summary.totalOrders}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">إجمالي الإيرادات</div>
          <div className="stat-card__value">{summary.totalRevenue.toFixed(2)} {cur}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">متوسط قيمة الطلب</div>
          <div className="stat-card__value">{summary.avgOrderValue.toFixed(2)} {cur}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">طلبات اليوم</div>
          <div className="stat-card__value">{summary.todayOrders}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">إيرادات اليوم</div>
          <div className="stat-card__value">{summary.todayRevenue.toFixed(2)} {cur}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">إيرادات آخر ٧ أيام</div>
          <div className="stat-card__value">{summary.weekRevenue.toFixed(2)} {cur}</div>
        </div>
        {summary.bestDay && (
          <div className="stat-card">
            <div className="stat-card__label">أفضل يوم مبيعاً</div>
            <div className="stat-card__value" style={{ fontSize: '1.1rem' }}>
              {summary.bestDay.dateKey}
            </div>
            <div className="stat-card__label" style={{ marginTop: 4 }}>
              {summary.bestDay.totalSales.toFixed(2)} {cur}
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="reports-tabs">
        <button
          type="button"
          className={`reports-tab${tab === 'daily' ? ' reports-tab--active' : ''}`}
          onClick={() => setTab('daily')}
        >
          المبيعات اليومية
        </button>
        <button
          type="button"
          className={`reports-tab${tab === 'items' ? ' reports-tab--active' : ''}`}
          onClick={() => setTab('items')}
        >
          أكثر الأصناف مبيعاً
        </button>
        <button
          type="button"
          className={`reports-tab${tab === 'cashiers' ? ' reports-tab--active' : ''}`}
          onClick={() => setTab('cashiers')}
        >
          أداء الكاشيرات
        </button>
      </div>

      {/* ── Daily sales ── */}
      {tab === 'daily' && (
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="card__title">المبيعات اليومية — كل السجل</h2>
          {daily.length === 0 ? (
            <p className="report-empty">لا توجد بيانات بعد</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>عدد الطلبات</th>
                  <th>إجمالي المبيعات</th>
                  <th>متوسط الطلب</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((r) => (
                  <tr key={r.dateKey}>
                    <td>{r.dateKey}</td>
                    <td>{r.orderCount}</td>
                    <td>{r.totalSales.toFixed(2)} {cur}</td>
                    <td>{r.avgOrder.toFixed(2)} {cur}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="report-total-row">
                  <td>الإجمالي</td>
                  <td>{summary.totalOrders}</td>
                  <td>{summary.totalRevenue.toFixed(2)} {cur}</td>
                  <td>{summary.avgOrderValue.toFixed(2)} {cur}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── Top items ── */}
      {tab === 'items' && (
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="card__title">أكثر الأصناف مبيعاً (أحدث ١٠٠ طلب)</h2>
          {topItems.length === 0 ? (
            <p className="report-empty">لا توجد بيانات بعد</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الصنف</th>
                  <th>الكمية المباعة</th>
                  <th>الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, i) => (
                  <tr key={item.nameAr}>
                    <td style={{ color: 'var(--color-primary)', fontWeight: 800 }}>
                      {i + 1}
                    </td>
                    <td>{item.nameAr}</td>
                    <td>{item.quantity}</td>
                    <td>{item.revenue.toFixed(2)} {cur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Cashiers ── */}
      {tab === 'cashiers' && (
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="card__title">أداء الكاشيرات</h2>
          {cashiers.length === 0 ? (
            <p className="report-empty">لا توجد بيانات بعد</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>الكاشير</th>
                  <th>عدد الطلبات</th>
                  <th>إجمالي المبيعات</th>
                  <th>متوسط الطلب</th>
                </tr>
              </thead>
              <tbody>
                {cashiers.map((c) => (
                  <tr key={c.cashierName}>
                    <td>{c.cashierName}</td>
                    <td>{c.orderCount}</td>
                    <td>{c.totalSales.toFixed(2)} {cur}</td>
                    <td>
                      {c.orderCount > 0
                        ? (c.totalSales / c.orderCount).toFixed(2)
                        : '0.00'}{' '}
                      {cur}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
