import { NavLink, useNavigate } from 'react-router-dom'
import { RESTAURANT_NAME_AR } from '@shared/constants/branding'
import { signOut, auth } from '@renderer/lib/firebase'
import { useAuthStore } from '@renderer/features/auth/auth-store'
import { SyncStatusBadge } from '@renderer/features/sync/SyncStatusBadge'
import { navLinkEnd, MdLogout, type NavItem } from '@renderer/config/navigation'

interface AppShellProps {
  nav: NavItem[]
  children: React.ReactNode
}

export function AppShell({ nav, children }: AppShellProps): React.ReactElement {
  const displayName = useAuthStore((s) => s.user?.displayName)
  const navigate = useNavigate()

  async function handleLogout(): Promise<void> {
    await signOut(auth)
    useAuthStore.getState().setUser(null)
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="القائمة الرئيسية">
        <div className="app-sidebar__brand">{RESTAURANT_NAME_AR}</div>

        <nav className="app-sidebar__nav">
          {nav.map((item) => {
            const Icon = item.icon
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
