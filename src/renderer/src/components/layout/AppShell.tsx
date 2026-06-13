import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { logoutUser } from '@renderer/features/auth/auth-service'
import { useAuthStore } from '@renderer/features/auth/auth-store'
import { SyncStatusBadge } from '@renderer/features/sync/SyncStatusBadge'
import { MdLogout, type NavItem } from '@renderer/config/navigation'
import { MdSystemUpdate, MdClose, MdExpandMore, MdExpandLess, MdLock } from 'react-icons/md'
import { triggerCheckNow, useUpdateState } from '@renderer/components/UpdateNotification'
import { usePinStore } from '@renderer/features/auth/pin-store'
import { getUnarchivedShiftCount } from '@renderer/features/shifts/shift-service'
import { getSettings } from '@renderer/features/orders/order-service'
import { RESTAURANT_NAME_AR } from '@shared/constants/branding'
import { SplitView, initSplitStore } from '@renderer/features/tabs/SplitView'
import { useSplitStore, mkTabId } from '@renderer/features/tabs/split-store'

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
  const [brandName, setBrandName] = useState(RESTAURANT_NAME_AR)
  const updateState = useUpdateState()
  const pinEnabled = usePinStore((s) => s.pinEnabled)
  const lockApp = usePinStore((s) => s.lock)

  const panes = useSplitStore((s) => s.panes)
  const focusedPaneId = useSplitStore((s) => s.focusedPaneId)

  // Build a flat map of path → nav item for tab sync
  const allNavItems = nav.flatMap((item) =>
    item.children
      ? item.children.map((c) => ({ to: c.to, label: c.label, iconKey: item.iconKey }))
      : [{ to: item.to, label: item.label, iconKey: item.iconKey }]
  )

  function findNavItem(path: string) {
    // Exact match first
    const exact = allNavItems.find((item) => item.to === path)
    if (exact) return exact
    // Then prefix match — but only if the nav item path is longer than just '/manager'
    // to avoid '/manager' swallowing all '/manager/...' routes
    return allNavItems.find(
      (item) => item.to !== '/manager' && path.startsWith(item.to + '/')
    ) ?? allNavItems.find((item) => item.to === '/manager' && path.startsWith('/manager'))
  }

  // Initialize split store synchronously on first render if empty
  // (useEffect is too late — causes a flash with no tab bar)
  const storeState = useSplitStore.getState()
  if (storeState.panes.length === 0) {
    const matched = findNavItem(location.pathname) ?? allNavItems[0]
    if (matched) {
      initSplitStore({ id: mkTabId(), path: matched.to, label: matched.label, iconKey: matched.iconKey ?? 'MdDashboard' })
    }
  }

  // KEY FIX: whenever the router location changes, sync the primary pane's
  // active tab to match. This makes the router the single source of truth.
  useEffect(() => {
    const state = useSplitStore.getState()
    const primaryPane = state.panes[0]
    if (!primaryPane) return

    const matched = findNavItem(location.pathname)
    if (!matched) return

    // Check if a tab for this path already exists in the primary pane
    const existing = primaryPane.tabs.find((t) => t.path === matched.to)
    if (existing) {
      if (primaryPane.activeTabId !== existing.id) {
        state.activateTab(primaryPane.id, existing.id)
      }
    } else {
      state.openInFocused({ path: matched.to, label: matched.label, iconKey: matched.iconKey ?? 'MdDashboard' }, mkTabId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(setCurrentVersion).catch(() => {})
  }, [])

  useEffect(() => {
    void getSettings().then((s) => {
      if (s.restaurantNameAr) setBrandName(s.restaurantNameAr)
    }).catch(() => {})
  }, [location.pathname])

  useEffect(() => {
    void getUnarchivedShiftCount().then(setShiftBadge).catch(() => {})
  }, [location.pathname])

  useEffect(() => {
    for (const item of nav) {
      if (item.children?.some((c) => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))) {
        setOpenDropdown(item.to)
        return
      }
    }
  }, [location.pathname, nav])

  function handleNavClick(item: { to: string; label: string; iconKey: string }): void {
    // Just navigate — the location sync effect will open/activate the tab automatically
    navigate(item.to)
  }

  function handleNavigatePrimary(path: string): void {
    navigate(path)
  }

  function handleNavigateSecondary(_path: string): void {
    // secondary pane renders by path from store — no router needed
  }

  async function handleLogout(): Promise<void> {
    await logoutUser()
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

  const isFlush = location.pathname === '/pos'
    || location.pathname === '/manager/purchases'
    || location.pathname === '/manager/items'
    || location.pathname === '/manager/cashiers'
  const primaryPane = panes[0]
  const focusedPane = panes.find((p) => p.id === focusedPaneId) ?? primaryPane
  // Use router location as source of truth for sidebar active state
  const focusedActivePath = location.pathname

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="app-sidebar" aria-label="القائمة الرئيسية">
        <div className="app-sidebar__brand">{brandName}</div>

        <nav className="app-sidebar__nav">
          {nav.map((item) => {
            const Icon = item.icon

            if (item.children) {
              const isOpen = openDropdown === item.to
              const isAnyChildActive = item.children.some(
                (c) => focusedActivePath === c.to
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
                    {item.hint && <span className="app-sidebar__link-hint">{item.hint}</span>}
                  </button>

                  {isOpen && (
                    <div className="app-sidebar__dropdown-menu">
                      {item.children.map((child) => (
                        <button
                          key={child.to}
                          type="button"
                          className={`app-sidebar__dropdown-item${
                            focusedActivePath === child.to ? ' app-sidebar__dropdown-item--active' : ''
                          }`}
                          onClick={() => handleNavClick({ ...child, iconKey: item.iconKey })}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <button
                key={item.to}
                type="button"
                className={`app-sidebar__link${focusedActivePath === item.to ? ' app-sidebar__link--active' : ''}`}
                onClick={() => handleNavClick(item)}
              >
                <span className="app-sidebar__link-row">
                  <Icon className="app-sidebar__link-icon" aria-hidden="true" />
                  <span className="app-sidebar__link-label">{item.label}</span>
                  {item.to === '/manager/shifts' && shiftBadge > 0 && (
                    <span className="app-sidebar__badge">{shiftBadge}</span>
                  )}
                </span>
                {item.hint && <span className="app-sidebar__link-hint">{item.hint}</span>}
              </button>
            )
          })}
        </nav>

        <div className="app-sidebar__footer">
          <SyncStatusBadge />
          {displayName && <span className="app-sidebar__user" title={displayName}>{displayName}</span>}

          {pinEnabled && userRole === 'cashier' && (
            <button type="button" className="btn btn--secondary btn--sm app-sidebar__lock-btn" onClick={lockApp}>
              <MdLock aria-hidden="true" /> قفل الشاشة
            </button>
          )}

          <div className="app-sidebar__update-wrap">
            <button type="button" className="btn btn--secondary btn--sm app-sidebar__update-btn" onClick={handleCheckUpdate}>
              <MdSystemUpdate aria-hidden="true" /> تحديث
            </button>

            {showPopup && (
              <div className="version-popup">
                <button type="button" className="version-popup__close" onClick={() => setShowPopup(false)} aria-label="إغلاق"><MdClose /></button>
                <div className="version-popup__row">
                  <span className="version-popup__label">الإصدار الحالي</span>
                  <span className="version-popup__value">v{currentVersion}</span>
                </div>
                <div className="version-popup__row">
                  <span className="version-popup__label">أحدث إصدار</span>
                  <span className="version-popup__value">
                    {updateState.phase === 'checking' && <span className="version-popup__checking">جارٍ التحقق…</span>}
                    {updateState.phase === 'error'    && <span className="version-popup__error">تعذّر الاتصال</span>}
                    {latestVersion && <span className={updateState.phase === 'uptodate' ? 'version-popup__same' : 'version-popup__newer'}>v{latestVersion}</span>}
                    {updateState.phase === 'idle'     && <span className="version-popup__checking">جارٍ التحقق…</span>}
                  </span>
                </div>
                {updateState.phase === 'uptodate' && <div className="version-popup__status version-popup__status--ok">✓ التطبيق محدّث</div>}
                {(updateState.phase === 'available' || updateState.phase === 'downloading' || updateState.phase === 'ready') && <div className="version-popup__status version-popup__status--new">↑ يتوفر تحديث جديد</div>}
                {updateState.phase === 'error' && <div className="version-popup__status version-popup__status--err">{updateState.message}</div>}
              </div>
            )}
          </div>

          <button type="button" className="btn btn--secondary btn--sm app-sidebar__logout" onClick={() => void handleLogout()}>
            <MdLogout aria-hidden="true" /> خروج
          </button>
        </div>
      </aside>

      {/* ── Content area ── */}
      <div className="app-shell__content">
        {primaryPane && (
          <SplitView onNavigate={handleNavigatePrimary}>
            <main className={`app-main${isFlush ? ' app-main--flush' : ''}`}>
              {children}
            </main>
          </SplitView>
        )}
      </div>
    </div>
  )
}
