import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { AppUser } from '@shared/types'
import { ConfirmDeleteButton } from '@renderer/components/ConfirmDeleteButton'
import {
  listUsersByRole,
  createCashierAccount,
  updateUserActive,
  updateUserProfile,
  deleteCashierAccount
} from '@renderer/features/auth/auth-service'
import { useAuthStore } from '@renderer/features/auth/auth-store'
import { MdEdit, MdCheck, MdClose } from 'react-icons/md'

export function CashiersPage(): React.ReactElement {
  const manager = useAuthStore((s) => s.user)!
  const [cashiers, setCashiers] = useState<AppUser[]>([])
  const [form, setForm] = useState({ email: '', displayName: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const load = useCallback(async () => {
    setCashiers(await listUsersByRole('cashier'))
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (!navigator.onLine) { setError('لا يمكن إنشاء حساب بدون اتصال بالإنترنت'); return }
    try {
      await createCashierAccount(
        { email: form.email.trim(), displayName: form.displayName.trim(), role: 'cashier', password: form.password },
        manager.id
      )
      setForm({ email: '', displayName: '', password: '' })
      setMessage('تم إنشاء الحساب بنجاح')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'فشل إنشاء الحساب') }
  }

  async function saveName(id: string): Promise<void> {
    if (!editingName.trim()) return
    await updateUserProfile(id, { displayName: editingName.trim() })
    setEditingId(null)
    setMessage('تم تعديل الاسم')
    await load()
  }

  return (
    <>
      {message && <p className="form-message form-message--ok" role="status">{message}</p>}

      <div className="card">
        <h2 className="card__title">إضافة كاشير</h2>
        <form onSubmit={(e) => void handleCreate(e)}>
          <label className="field">
            <span>الاسم</span>
            <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} required />
          </label>
          <label className="field">
            <span>البريد الإلكتروني</span>
            <input type="email" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </label>
          <label className="field">
            <span>كلمة المرور</span>
            <input type="password" dir="ltr" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={6} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn--primary">إنشاء حساب</button>
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
                <td>
                  {editingId === c.id ? (
                    <input
                      className="inline-edit-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveName(c.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                    />
                  ) : c.displayName}
                </td>
                <td dir="ltr">{c.email}</td>
                <td>
                  <button
                    type="button"
                    className={`btn btn--sm ${c.active ? 'btn--secondary' : 'btn--danger'}`}
                    onClick={() => void updateUserActive(c.id, !c.active).then(load)}
                  >
                    {c.active ? 'مفعّل' : 'معطّل'}
                  </button>
                </td>
                <td>
                  <div className="table-actions">
                    {editingId === c.id ? (
                      <>
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveName(c.id)}>
                          <MdCheck /> حفظ
                        </button>
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditingId(null)}>
                          <MdClose />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => { setEditingId(c.id); setEditingName(c.displayName) }}
                        >
                          <MdEdit /> تعديل الاسم
                        </button>
                        <ConfirmDeleteButton
                          confirmMessage={`حذف حساب "${c.displayName}" نهائياً؟`}
                          onConfirm={async () => {
                            if (!navigator.onLine) { setError('لا يمكن حذف الحساب بدون اتصال'); return }
                            await deleteCashierAccount(c.id)
                            await load()
                          }}
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
