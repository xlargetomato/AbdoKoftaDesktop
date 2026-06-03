import { useState, type FormEvent } from 'react'
import type { IngredientStock } from '@shared/types'

export type InventoryActionType = 'waste' | 'adjustment'

interface InventoryActionModalProps {
  stock: IngredientStock
  action: InventoryActionType
  onClose: () => void
  onSubmit: (quantity: number, noteAr: string) => Promise<void>
}

const TITLES: Record<InventoryActionType, string> = {
  waste: 'تسجيل هدر',
  adjustment: 'تسوية مخزون'
}

const HINTS: Record<InventoryActionType, string> = {
  waste: 'أدخل كمية الهدر (رقم موجب — سيتم خصمها من المخزون)',
  adjustment:
    'أدخل + لزيادة المخزون أو − للنقصان (مثال: +200 أو -50)'
}

export function InventoryActionModal({
  stock,
  action,
  onClose,
  onSubmit
}: InventoryActionModalProps): React.ReactElement {
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    const raw = Number(quantity)
    if (!Number.isFinite(raw) || raw === 0) {
      setError('أدخل كمية صحيحة غير صفر')
      return
    }
    if (action === 'waste' && raw < 0) {
      setError('كمية الهدر يجب أن تكون موجبة')
      return
    }
    setLoading(true)
    try {
      const signed = action === 'waste' ? Math.abs(raw) : raw
      await onSubmit(signed, note.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="inv-modal-title"
      >
        <h2 id="inv-modal-title" className="card__title">
          {TITLES[action]} — {stock.nameAr}
        </h2>
        <p className="modal-hint">
          الرصيد الحالي: {stock.quantity.toFixed(2)} {stock.unit}
        </p>
        <p className="modal-hint">{HINTS[action]}</p>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            <span>الكمية</span>
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              autoFocus
              placeholder={action === 'adjustment' ? '+200' : '500'}
            />
          </label>
          <label className="field">
            <span>ملاحظة</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="اختياري"
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              disabled={loading}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
