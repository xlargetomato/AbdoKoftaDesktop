import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { RESTAURANT_NAME_AR } from '@shared/constants/branding'
import { PasswordInput } from '@renderer/components/PasswordInput'
import { loginAndLoadUser } from './auth-service'
import { useAuthStore } from './auth-store'
import type { AppUser } from '@shared/types'

function homeFor(user: AppUser): string {
  return user.role === 'manager' ? '/manager' : '/pos'
}

export function LoginPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()
  const [email, setEmail] = useState('manager@abdokofta.local')
  const [password, setPassword] = useState('Manager123!')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) {
    return <Navigate to={homeFor(user)} replace />
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const appUser = await loginAndLoadUser(email.trim(), password)
      setUser(appUser)
      navigate(homeFor(appUser), { replace: true })
    } catch (err) {
      console.error('[login]', err)
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__bar" />
        <h1 className="login-card__title">{RESTAURANT_NAME_AR}</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="login-form">
          <label className="field">
            <span>البريد الإلكتروني</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              dir="ltr"
            />
          </label>
          <label className="field">
            <span>كلمة المرور</span>
            <PasswordInput value={password} onChange={setPassword} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn--primary btn--lg" disabled={loading}>
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  )
}
