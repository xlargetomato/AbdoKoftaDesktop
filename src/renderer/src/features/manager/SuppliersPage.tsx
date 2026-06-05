import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Supplier, SupplierTransactionType } from '@shared/types'
import {
  createSupplier,
  getSupplierBalance,
  listSuppliers,
  recordSupplierTransaction,
  updateSupplier
} from '@renderer/features/suppliers/supplier-service'
import { recordCashDrawerTransaction } from '@renderer/features/cash/cash-service'
import { useAuthStore } from '@renderer/features/auth/auth-store'

const TX_TYPES: Array<{ value: SupplierTransactionType; label: string }> = [
  { value: 'purchase_credit', label: 'توريد على الحساب' },
  { value: 'payment', label: 'دفعة للمورد' },
  { value: 'debt_increase', label: 'زيادة مديونية' },
  { value: 'debt_decrease', label: 'تقليل مديونية' },
  { value: 'settlement', label: 'تصفية حساب' }
]

export function SuppliersPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user)!
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ nameAr: '', phone: '', noteAr: '' })
  const [txForm, setTxForm] = useState({
    supplierId: '',
    type: 'payment' as SupplierTransactionType,
    amount: '',
    noteAr: ''
  })
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const list = await listSuppliers()
    setSuppliers(list)
    const pairs = await Promise.all(list.map(async (s) => [s.id, await getSupplierBalance(s.id)] as const))
    setBalances(Object.fromEntries(pairs))
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault()
    await createSupplier({
      nameAr: form.nameAr.trim(),
      phone: form.phone || undefined,
      noteAr: form.noteAr || undefined
    })
    setForm({ nameAr: '', phone: '', noteAr: '' })
    setMessage('تم إضافة المورد')
    await load()
  }

  async function handleTx(e: FormEvent): Promise<void> {
    e.preventDefault()
    const amount = Math.abs(Number(txForm.amount))
    if (!txForm.supplierId || !amount) return
    await recordSupplierTransaction({
      supplierId: txForm.supplierId,
      type: txForm.type,
      amount,
      noteAr: txForm.noteAr || undefined,
      createdBy: user.id
    })
    if (txForm.type === 'payment' || txForm.type === 'settlement') {
      await recordCashDrawerTransaction({
        type: 'supplier_payment',
        amount: -amount,
        supplierId: txForm.supplierId,
        noteAr: txForm.noteAr || 'دفع مورد',
        createdBy: user.id
      })
    }
    setTxForm((f) => ({ ...f, amount: '', noteAr: '' }))
    setMessage('تم تسجيل حركة المورد')
    await load()
  }

  return (
    <>
      {message && <p className="form-message form-message--ok">{message}</p>}
      <div className="settings-page">
        <div className="card">
          <h2 className="card__title">إضافة مورد</h2>
          <form onSubmit={(e) => void handleCreate(e)}>
            <label className="field"><span>اسم المورد</span><input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} required /></label>
            <label className="field"><span>الهاتف</span><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} dir="ltr" /></label>
            <label className="field"><span>ملاحظة</span><input value={form.noteAr} onChange={(e) => setForm((f) => ({ ...f, noteAr: e.target.value }))} /></label>
            <button type="submit" className="btn btn--primary">حفظ المورد</button>
          </form>
        </div>

        <div className="card">
          <h2 className="card__title">حركة حساب مورد</h2>
          <form onSubmit={(e) => void handleTx(e)}>
            <label className="field">
              <span>المورد</span>
              <select value={txForm.supplierId} onChange={(e) => setTxForm((f) => ({ ...f, supplierId: e.target.value }))} required>
                <option value="">اختر...</option>
                {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
              </select>
            </label>
            <label className="field">
              <span>نوع الحركة</span>
              <select value={txForm.type} onChange={(e) => setTxForm((f) => ({ ...f, type: e.target.value as SupplierTransactionType }))}>
                {TX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="field"><span>المبلغ</span><input type="number" min="0.01" step="0.01" value={txForm.amount} onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
            <label className="field"><span>السبب / الملاحظة</span><input value={txForm.noteAr} onChange={(e) => setTxForm((f) => ({ ...f, noteAr: e.target.value }))} /></label>
            <button type="submit" className="btn btn--primary">تسجيل الحركة</button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">الموردين</h2>
        <table className="data-table">
          <thead><tr><th>الاسم</th><th>الهاتف</th><th>الرصيد</th><th>الحالة</th></tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.nameAr}</td>
                <td dir="ltr">{s.phone ?? '-'}</td>
                <td>{(balances[s.id] ?? 0).toFixed(2)}</td>
                <td>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => void updateSupplier(s.id, { active: !s.active }).then(load)}>
                    {s.active ? 'مفعل' : 'معطل'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
