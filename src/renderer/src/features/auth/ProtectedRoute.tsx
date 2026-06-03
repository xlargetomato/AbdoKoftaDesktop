import { Navigate, Outlet } from 'react-router-dom'
import { PageLoader } from '@renderer/components/PageLoader'
import { useAuthStore } from './auth-store'
import type { UserRole } from '@shared/types'

interface ProtectedRouteProps {
  roles?: UserRole[]
}

export function ProtectedRoute({ roles }: ProtectedRouteProps): React.ReactElement {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)

  if (loading) return <PageLoader />

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'manager' ? '/manager' : '/pos'} replace />
  }

  return <Outlet />
}
