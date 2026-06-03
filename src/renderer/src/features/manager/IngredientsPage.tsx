import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Ingredient } from '@shared/types'
import { ConfirmDeleteButton } from '@renderer/components/ConfirmDeleteButton'
import {
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient
} from '@renderer/features/inventory/inventory-service'

export function IngredientsPage(): React.ReactElement {
  const [items, setItems] = useState<Ingredient[]>([])
  const [nameAr, setNameAr] = useState('')
  const [unit, setUnit] = useState('جرام')
  const [threshold, setThreshold] = useState('')

  const load = useCallback(async () => {
    setItems(await listIngredients())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleAdd(e: FormEvent): Promise<void> {
    e.preventDefault()
    await createIngredient({
      nameAr: nameAr.trim(),
      unit,
      lowStockThreshold: threshold ? Number(threshold) : undefined,
      active: true
    })
    setNameAr('')
    setThreshold('')
    await load()
  }

  return (
    <>
      <div className="card">
        <h2 className="card__title">إضافة مكوّن</h2>
        <form onSubmit={(e) => void handleAdd(e)} className="page-toolbar">
          <label className="field" style={{ flex: 1, margin: 0 }}>
            <span>الاسم</span>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>الوحدة</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="جرام">جرام</option>
              <option value="كيلوجرام">كيلوجرام</option>
              <option value="قطعة">قطعة</option>
              <option value="مل">مل</option>
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>حد التنبيه</span>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="اختياري"
            />
          </label>
          <button type="submit" className="btn btn--primary">
            إضافة
          </button>
        </form>
      </div>
      <div className="card">
        <h2 className="card__title">المكوّنات</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الوحدة</th>
              <th>حد التنبيه</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.nameAr}</td>
                <td>{i.unit}</td>
                <td>{i.lowStockThreshold ?? '—'}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() =>
                      void updateIngredient(i.id, { active: !i.active }).then(load)
                    }
                  >
                    {i.active ? 'مفعّل' : 'معطّل'}
                  </button>
                </td>
                <td>
                  <ConfirmDeleteButton
                    confirmMessage={`حذف "${i.nameAr}" نهائياً؟`}
                    onConfirm={async () => {
                      await deleteIngredient(i.id)
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
