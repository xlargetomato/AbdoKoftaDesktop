import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MANAGER_NAV, navLinkEnd } from '@renderer/config/navigation'
import { getSummaryStats } from '@renderer/features/reports/reports-service'

export function ManagerDashboard(): React.ReactElement {
  const [stats, setStats] = useState({
    todayOrders: 0,
    todayRevenue: 0,
    weekRevenue: 0
  })

  useEffect(() => {
    void getSummaryStats().then(setStats)
  }, [])

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">لوحة التحكم</h1>
        <p className="page-header__subtitle">ملخص سريع ثم اختر القسم للإدارة</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__label">طلبات اليوم</div>
          <div className="stat-card__value">{stats.todayOrders}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">إيرادات اليوم</div>
          <div className="stat-card__value">{stats.todayRevenue.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">إيرادات الأسبوع</div>
          <div className="stat-card__value">{stats.weekRevenue.toFixed(2)}</div>
        </div>
      </div>

      <section className="dashboard-tiles" aria-label="أقسام الإدارة">
        {MANAGER_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={navLinkEnd(item)}
            className={({ isActive }) =>
              `dashboard-tile${isActive ? ' dashboard-tile--active' : ''}`
            }
          >
            <span className="dashboard-tile__label">{item.label}</span>
            {item.hint && (
              <span className="dashboard-tile__hint">{item.hint}</span>
            )}
          </NavLink>
        ))}
      </section>
    </>
  )
}
