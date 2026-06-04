import { useEffect, useState } from 'react'
import {
  getFullReport,
  type ReportData,
  type DateRange
} from '@renderer/features/reports/reports-service'

type Tab = 'daily' | 'items' | 'cashiers'

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today',  label: 'اليوم'         },
  { value: 'week',   label: 'آخر ٧ أيام'    },
  { value: 'month',  label: 'آخر ٣٠ يوم'   },
  { value: 'year',   label: 'آخر سنة'       },
  { value: 'all',    label: 'كل السجل'      }
]

export function ReportsPage(): React.ReactElement {
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<Tab>('daily')
  const [range, setRange]     = useState<DateRange>('month')

  useEffect(() => {
    setLoading(true)
    void getFullReport(range).then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [range])

  const cur = 'ج.م'
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? ''

  return (
    <div className="reports-page">

      {/* ── Date range filter ── */}
      <div className="reports-filter">
        <span className="reports-filter__label">الفترة الزمنية:</span>
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
      </div>

      {loading ? (
        <p className="app-loading">جارٍ تحميل التقارير…</p>
      ) : !data ? null : (
        <>
          {/* ── Summary cards ── */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card__label">إجمالي الطلبات — {rangeLabel}</div>
              <div className="stat-card__value">{data.summary.totalOrders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">إجمالي الإيرادات — {rangeLabel}</div>
              <div className="stat-card__value">{data.summary.totalRevenue.toFixed(2)} {cur}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">متوسط قيمة الطلب</div>
              <div className="stat-card__value">{data.summary.avgOrderValue.toFixed(2)} {cur}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">طلبات اليوم</div>
              <div className="stat-card__value">{data.summary.todayOrders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">إيرادات اليوم</div>
              <div className="stat-card__value">{data.summary.todayRevenue.toFixed(2)} {cur}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">إيرادات آخر ٧ أيام</div>
              <div className="stat-card__value">{data.summary.weekRevenue.toFixed(2)} {cur}</div>
            </div>
            {data.summary.bestDay && (
              <div className="stat-card">
                <div className="stat-card__label">أفضل يوم في الفترة</div>
                <div className="stat-card__value" style={{ fontSize: '1.1rem' }}>
                  {data.summary.bestDay.dateKey}
                </div>
                <div className="stat-card__label" style={{ marginTop: 4 }}>
                  {data.summary.bestDay.totalSales.toFixed(2)} {cur}
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
              <h2 className="card__title">المبيعات اليومية — {rangeLabel}</h2>
              {data.daily.length === 0 ? (
                <p className="report-empty">لا توجد بيانات في هذه الفترة</p>
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
                    {data.daily.map((r) => (
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
                      <td>{data.summary.totalOrders}</td>
                      <td>{data.summary.totalRevenue.toFixed(2)} {cur}</td>
                      <td>{data.summary.avgOrderValue.toFixed(2)} {cur}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* ── Top items ── */}
          {tab === 'items' && (
            <div className="card" style={{ marginTop: 0 }}>
              <h2 className="card__title">أكثر الأصناف مبيعاً — {rangeLabel}</h2>
              {data.topItems.length === 0 ? (
                <p className="report-empty">لا توجد بيانات في هذه الفترة</p>
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
                    {data.topItems.map((item, i) => (
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
              <h2 className="card__title">أداء الكاشيرات — {rangeLabel}</h2>
              {data.cashiers.length === 0 ? (
                <p className="report-empty">لا توجد بيانات في هذه الفترة</p>
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
                    {data.cashiers.map((c) => (
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
        </>
      )}
    </div>
  )
}
