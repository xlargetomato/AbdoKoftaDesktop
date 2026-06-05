import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { RESTAURANT_NAME_AR } from '@shared/constants/branding'
import { signOut, auth } from '@renderer/lib/firebase'
import { useAuthStore } from '@renderer/features/auth/auth-store'
import { SyncStatusBadge } from '@renderer/features/sync/SyncStatusBadge'
import { navLinkEnd, MdLogout, type NavItem } from '@renderer/config/navigation'
import { MdSystemUpdate, MdClose, MdExpandMore, MdExpandLess, MdLock } from 'react-icons/md'
import { triggerCheckNow, useUpdateState } from '@renderer/components/UpdateNotification'
import { usePinStore } from '@renderer/features/auth/pin-store'
import { getUnarchivedShiftCount } from '@renderer/features/shifts/shift-service'

interface AppShellProps {
  nav: NavItem[]
  children: React.ReactNode
}

export function AppShell({ nav, children }: AppShellProps): React.ReactElement {
  const displayName = useAuthStore((s) => s.user?.displayName)
  const userRole = useAuthStore((s) => s.user?.role)
  const navigate = useNavigate()
  const location = useLocation()
  const [currentVersion, setCurrentVersion] = useState<string>('...')
  const [showPopup, setShowPopup] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [shiftBadge, setShiftBadge] = useState(0)
  const updateState = useUpdateState()
  const pinEnabled = usePinStore((s) => s.pinEnabled)
  const lockApp = usePinStore((s) => s.lock)

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(setCurrentVersion).catch(() => {})
  }, [])

  useEffect(() => {
    void getUnarchivedShiftCount().then(setShiftBadge).catch(() => {})
  }, [location.pathname])

  // Auto-open dropdown if current path matches a child
  useEffect(() => {
    for (const item of nav) {
      if (item.children?.some((c) => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))) {
        setOpenDropdown(item.to)
        return
      }
    }
  }, [location.pathname, nav])

  async function handleLogout(): Promise<void> {
    await signOut(auth)
    useAuthStore.getState().setUser(null)
    navigate('/login')
  }

  function handleCheckUpdate(): void {
    setShowPopup(true)
    triggerCheckNow()
  }

  const latestVersion =
    updateState.phase === 'uptodate'    ? updateState.latestVersion :
    updateState.phase === 'available'   ? updateState.version :
    updateState.phase === 'downloading' ? updateState.version :
    updateState.phase === 'ready'       ? updateState.version :
    null

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="القائمة الرئيسية">
        <div className="app-sidebar__brand">{RESTAURANT_NAME_AR}</div>

        <nav className="app-sidebar__nav">
          {nav.map((item) => {
            const Icon = item.icon

            // Item with dropdown children
            if (item.children) {
              const isOpen = openDropdown === item.to
              const isAnyChildActive = item.children.some(
                (c) => location.pathname === c.to || location.pathname.startsWith(c.to + '/')
              )
              return (
                <div key={item.to} className="app-sidebar__dropdown">
                  <button
                    type="button"
                    className={`app-sidebar__link app-sidebar__dropdown-trigger${isAnyChildActive ? ' app-sidebar__link--active' : ''}`}
                    onClick={() => setOpenDropdown(isOpen ? null : item.to)}
                    aria-expanded={isOpen}
                  >
                    <span className="app-sidebar__link-row">
                      <Icon className="app-sidebar__link-icon" aria-hidden="true" />
                      <span className="app-sidebar__link-label">{item.label}</span>
                      <span className="app-sidebar__dropdown-arrow">
                        {isOpen ? <MdExpandLess /> : <MdExpandMore />}
                      </span>
                    </span>
                    {item.hint && (
                      <span className="app-sidebar__link-hint">{item.hint}</span>
                    )}
                  </button>

                  {isOpen && (
                    <div className="app-sidebar__dropdown-menu">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end
                          className={({ isActive }) =>
                            `app-sidebar__dropdown-item${isActive ? ' app-sidebar__dropdown-item--active' : ''}`
                          }
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            // Regular item
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={navLinkEnd(item)}
                className={({ isActive }) =>
                  `app-sidebar__link${isActive ? ' app-sidebar__link--active' : ''}`
                }
              >
                <span className="app-sidebar__link-row">
                  <Icon className="app-sidebar__link-icon" aria-hidden="true" />
                  <span className="app-sidebar__link-label">{item.label}</span>
                  {item.to === '/manager/shifts' && shiftBadge > 0 && (
                    <span className="app-sidebar__badge">{shiftBadge}</span>
                  )}
                </span>
                {item.hint && (
                  <span className="app-sidebar__link-hint">{item.hint}</span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="app-sidebar__footer">
          <SyncStatusBadge />
          {displayName && (
            <span className="app-sidebar__user" title={displayName}>
              {displayName}
            </span>
          )}

          {/* ── Lock button (cashiers only when PIN enabled) ── */}
          {pinEnabled && userRole === 'cashier' && (
            <button
              type="button"
              className="btn btn--secondary btn--sm app-sidebar__lock-btn"
              onClick={lockApp}
              title="قفل الشاشة"
            >
              <MdLock aria-hidden="true" />
              قفل الشاشة
            </button>
          )}

          {/* ── Update button ── */}
          <div className="app-sidebar__update-wrap">
            <button
              type="button"
              className="btn btn--secondary btn--sm app-sidebar__update-btn"
              onClick={handleCheckUpdate}
              title="التحقق من التحديثات"
            >
              <MdSystemUpdate aria-hidden="true" />
              تحديث
            </button>

            {showPopup && (
              <div className="version-popup">
                <button type="button" className="version-popup__close" onClick={() => setShowPopup(false)} aria-label="إغلاق">
                  <MdClose />
                </button>
                <div className="version-popup__row">
                  <span className="version-popup__label">الإصدار الحالي</span>
                  <span className="version-popup__value">v{currentVersion}</span>
                </div>
                <div className="version-popup__row">
                  <span className="version-popup__label">أحدث إصدار</span>
                  <span className="version-popup__value">
                    {updateState.phase === 'checking' && <span className="version-popup__checking">جارٍ التحقق…</span>}
                    {updateState.phase === 'error' && <span className="version-popup__error">تعذّر الاتصال</span>}
                    {latestVersion && (
                      <span className={updateState.phase === 'uptodate' ? 'version-popup__same' : 'version-popup__newer'}>
                        v{latestVersion}
                      </span>
                    )}
                    {updateState.phase === 'idle' && <span className="version-popup__checking">جارٍ التحقق…</span>}
                  </span>
                </div>
                {updateState.phase === 'uptodate' && <div className="version-popup__status version-popup__status--ok">✓ التطبيق محدّث</div>}
                {(updateState.phase === 'available' || updateState.phase === 'downloading' || updateState.phase === 'ready') && (
                  <div className="version-popup__status version-popup__status--new">↑ يتوفر تحديث جديد</div>
                )}
                {updateState.phase === 'error' && <div className="version-popup__status version-popup__status--err">{updateState.message}</div>}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn--secondary btn--sm app-sidebar__logout"
            onClick={() => void handleLogout()}
          >
            <MdLogout aria-hidden="true" />
            خروج
          </button>
        </div>
      </aside>

      <div className="app-shell__content">
        <main className="app-main">{children}</main>
      </div>
    </div>
  )
}
