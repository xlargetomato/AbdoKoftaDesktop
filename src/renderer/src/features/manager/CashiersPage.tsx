import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { AppUser } from '@shared/types'
import { ConfirmDeleteButton } from '@renderer/components/ConfirmDeleteButton'
import {
  listUsersByRole,
  createCashierAccount,
  updateUserActive,
  deleteCashierAccount
} from '@renderer/features/auth/auth-service'
import { useAuthStore } from '@renderer/features/auth/auth-store'

export function CashiersPage(): React.ReactElement {
  const manager = useAuthStore((s) => s.user)!
  const [cashiers, setCashiers] = useState<AppUser[]>([])
  const [form, setForm] = useState({
    email: '',
    displayName: '',
    password: ''
  })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setCashiers(await listUsersByRole('cashier'))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    try {
      await createCashierAccount(
        {
          email: form.email.trim(),
          displayName: form.displayName.trim(),
          role: 'cashier',
          password: form.password
        },
        manager.id
      )
      setForm({ email: '', displayName: '', password: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إنشاء الحساب')
    }
  }

  return (
    <>
      <div className="card">
        <h2 className="card__title">إضافة كاشير</h2>
        <form onSubmit={(e) => void handleCreate(e)}>
          <label className="field">
            <span>الاسم</span>
            <input
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>البريد</span>
            <input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>كلمة المرور</span>
            <input
              type="password"
              dir="ltr"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={6}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn--primary">
            إنشاء حساب
          </button>
        </form>
      </div>
      <div className="card">
        <h2 className="card__title">حسابات الكاشير</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>البريد</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {cashiers.map((c) => (
              <tr key={c.id}>
                <td>{c.displayName}</td>
                <td dir="ltr">{c.email}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() =>
                      void updateUserActive(c.id, !c.active).then(load)
                    }
                  >
                    {c.active ? 'مفعّل' : 'معطّل'}
                  </button>
                </td>
                <td>
                  <ConfirmDeleteButton
                    confirmMessage={`حذف حساب "${c.displayName}" نهائياً؟`}
                    onConfirm={async () => {
                      await deleteCashierAccount(c.id)
                      await load()
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
