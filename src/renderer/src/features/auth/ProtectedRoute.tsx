import { Navigate, Outlet } from 'react-router-dom'
import { PageLoader } from '@renderer/components/PageLoader'
import { useAuthStore } from './auth-store'
import type { UserRole } from '@shared/types'
import { hasPermission, type Permission } from '@shared/types/user'

interface ProtectedRouteProps {
  roles?: UserRole[]
  permission?: Permission
}

export function ProtectedRoute({ roles, permission }: ProtectedRouteProps): React.ReactElement {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />

  if (permission && !hasPermission(user, permission)) {
    return <Navigate to={user.role === 'manager' ? '/manager' : '/pos'} replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'manager' ? '/manager' : '/pos'} replace />
  }

  return <Outlet />
}
