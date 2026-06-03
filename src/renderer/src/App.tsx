import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, Outlet } from 'react-router-dom'
import { useAuthBootstrap } from '@renderer/features/auth/use-auth-bootstrap'
import { useSyncListener } from '@renderer/features/sync/use-sync-listener'
import { useAuthStore } from '@renderer/features/auth/auth-store'
import { ProtectedRoute } from '@renderer/features/auth/ProtectedRoute'
import { AppShell } from '@renderer/components/layout/AppShell'
import { PageLoader } from '@renderer/components/PageLoader'
import { UpdateNotification } from '@renderer/components/UpdateNotification'
import { CASHIER_NAV, MANAGER_NAV } from '@renderer/config/navigation'

const LoginPage = lazy(() =>
  import('@renderer/features/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const PosPage = lazy(() =>
  import('@renderer/features/pos/PosPage').then((m) => ({ default: m.PosPage }))
)
const OrderHistoryPage = lazy(() =>
  import('@renderer/features/pos/OrderHistoryPage').then((m) => ({
    default: m.OrderHistoryPage
  }))
)
const ManagerDashboard = lazy(() =>
  import('@renderer/features/manager/ManagerDashboard').then((m) => ({
    default: m.ManagerDashboard
  }))
)
const IngredientsPage = lazy(() =>
  import('@renderer/features/manager/IngredientsPage').then((m) => ({
    default: m.IngredientsPage
  }))
)
const InventoryPage = lazy(() =>
  import('@renderer/features/manager/InventoryPage').then((m) => ({
    default: m.InventoryPage
  }))
)
const MenuManagementPage = lazy(() =>
  import('@renderer/features/manager/MenuManagementPage').then((m) => ({
    default: m.MenuManagementPage
  }))
)
const CashiersPage = lazy(() =>
  import('@renderer/features/manager/CashiersPage').then((m) => ({
    default: m.CashiersPage
  }))
)
const ReportsPage = lazy(() =>
  import('@renderer/features/manager/ReportsPage').then((m) => ({
    default: m.ReportsPage
  }))
)

function CashierLayout(): React.ReactElement {
  return (
    <AppShell nav={CASHIER_NAV}>
      <Outlet />
    </AppShell>
  )
}

function ManagerLayout(): React.ReactElement {
  return (
    <AppShell nav={MANAGER_NAV}>
      <Outlet />
    </AppShell>
  )
}

function RootRedirect(): React.ReactElement {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return (
    <Navigate to={user.role === 'manager' ? '/manager' : '/pos'} replace />
  )
}

function LazyPage({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export default function App(): React.ReactElement {
  useAuthBootstrap()
  useSyncListener()

  return (
    <HashRouter>
      <UpdateNotification />
      <Routes>
        <Route
          path="/login"
          element={
            <LazyPage>
              <LoginPage />
            </LazyPage>
          }
        />
        <Route path="/" element={<RootRedirect />} />

        <Route element={<ProtectedRoute roles={['cashier']} />}>
          <Route element={<CashierLayout />}>
            <Route
              path="/pos"
              element={
                <LazyPage>
                  <PosPage />
                </LazyPage>
              }
            />
            <Route
              path="/pos/history"
              element={
                <LazyPage>
                  <OrderHistoryPage />
                </LazyPage>
              }
            />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['manager']} />}>
          <Route element={<ManagerLayout />}>
            <Route
              path="/manager"
              element={
                <LazyPage>
                  <ManagerDashboard />
                </LazyPage>
              }
            />
            <Route
              path="/manager/ingredients"
              element={
                <LazyPage>
                  <IngredientsPage />
                </LazyPage>
              }
            />
            <Route
              path="/manager/inventory"
              element={
                <LazyPage>
                  <InventoryPage />
                </LazyPage>
              }
            />
            <Route
              path="/manager/menu"
              element={
                <LazyPage>
                  <MenuManagementPage />
                </LazyPage>
              }
            />
            <Route
              path="/manager/cashiers"
              element={
                <LazyPage>
                  <CashiersPage />
                </LazyPage>
              }
            />
            <Route
              path="/manager/reports"
              element={
                <LazyPage>
                  <ReportsPage />
                </LazyPage>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
