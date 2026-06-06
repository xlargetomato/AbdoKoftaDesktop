import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import type { MenuCategory, MenuItem } from '@shared/types'
import { getIngredientStocks } from '@renderer/features/inventory/inventory-service'
import { listCategories, listMenuItems, getRecipeByMenuItem } from '@renderer/features/menu/menu-service'
import {
  completeOrder,
  getSettings,
  type CartLine
} from '@renderer/features/orders/order-service'
import { getOrderItems } from '@renderer/features/orders/order-service'
import { printReceipt } from '@renderer/features/receipt/receipt-builder'
import { useAuthStore } from '@renderer/features/auth/auth-store'
import {
  lineTotal,
  orderSubtotal,
  orderTotal
} from '@shared/services/order-calculator'
import { orderReference } from '@shared/services/order-reference'
import { closeShift, getOpenShiftForCashier } from '@renderer/features/shifts/shift-service'

interface LocalCartLine extends CartLine {
  key: string
}

const WEIGHT_SHORTCUTS = [
  { label: '1/8', kg: 0.125 },
  { label: '1/4', kg: 0.25 },
  { label: '1/3', kg: 1 / 3 },
  { label: '1/2', kg: 0.5 },
  { label: '1',   kg: 1 },
  { label: 'جم',  kg: null } // custom
]

// ── Weight popup ──────────────────────────────────────────────────────────────

interface WeightPopupProps {
  item: MenuItem
  anchor: DOMRect
  onSelect: (kg: number) => void
  onClose: () => void
}

function WeightPopup({ item, anchor, onSelect, onClose }: WeightPopupProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Position popup above/below anchor
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 500,
    left: anchor.left,
    top: anchor.bottom + 6,
    minWidth: anchor.width || 160
  }

  return (
    <div ref={ref} className="weight-popup" style={style}>
      <div className="weight-popup__header">
        <span>{item.nameAr}</span>
        <span className="weight-popup__price">{item.price.toFixed(2)} / كجم</span>
      </div>
      <div className="weight-popup__shortcuts">
        {WEIGHT_SHORTCUTS.filter((w) => w.kg !== null).map((w) => (
          <button
            key={w.label}
            type="button"
            className="weight-popup__btn"
            onClick={() => { onSelect(w.kg!); onClose() }}
          >
            {w.label} كجم
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main POS page ─────────────────────────────────────────────────────────────

export function PosPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user)!
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  // Map: menuItemId → out-of-stock ingredient name (undefined = available)
  const [unavailableItems, setUnavailableItems] = useState<Map<string, string>>(new Map())
  const [lowStockItems, setLowStockItems] = useState<Set<string>>(new Set())
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<LocalCartLine[]>([])
  const [orderNote, setOrderNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  // Weight popup state
  const [weightPopup, setWeightPopup] = useState<{ item: MenuItem; rect: DOMRect } | null>(null)

  const load = useCallback(async () => {
    const [cats, menu, stocks] = await Promise.all([
      listCategories(),
      listMenuItems(true),
      getIngredientStocks()
    ])
    setCategories(cats.filter((c) => c.active))
    setItems(menu)

    // Build out-of-stock map: ingredientId → nameAr
    const outOfStock = new Map<string, string>()
    const lowStock = new Set<string>()
    for (const s of stocks) {
      if (s.quantity <= 0) outOfStock.set(s.ingredientId, s.nameAr)
      else if (s.lowStockThreshold != null && s.quantity <= s.lowStockThreshold) {
        lowStock.add(s.ingredientId)
      }
    }

    // For each menu item, check if any recipe ingredient is out of stock
    const unavailable = new Map<string, string>()
    const lowItems = new Set<string>()
    await Promise.all(
      menu.map(async (item) => {
        const recipe = await getRecipeByMenuItem(item.id)
        if (!recipe) return
        for (const line of recipe.lines) {
          if (outOfStock.has(line.ingredientId)) {
            unavailable.set(item.id, outOfStock.get(line.ingredientId)!)
            break
          }
          if (lowStock.has(line.ingredientId)) {
            lowItems.add(item.id)
          }
        }
      })
    )
    setUnavailableItems(unavailable)
    setLowStockItems(lowItems)
  }, [])

  useEffect(() => { void load() }, [load])

  const filteredItems = useMemo(() => {
    let list = items
    if (selectedCategory !== 'all') list = list.filter((i) => i.categoryId === selectedCategory)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((i) => i.nameAr.toLowerCase().includes(q))
    }
    return list
  }, [items, selectedCategory, search])

  const subtotal = orderSubtotal(cart)
  const total = orderTotal(subtotal)

  function addToCart(item: MenuItem, quantity = 1): void {
    if (unavailableItems.has(item.id)) return
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id)
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id
            ? { ...l, quantity: l.quantity + quantity, weightGrams: item.isWeighted ? Math.round((l.quantity + quantity) * 1000) : undefined }
            : l
        )
      }
      return [
        ...prev,
        {
          key: item.id,
          menuItemId: item.id,
          nameAr: item.nameAr,
          unitPrice: item.price,
          quantity,
          unitLabel: item.isWeighted ? 'كجم' : undefined,
          weightGrams: item.isWeighted ? Math.round(quantity * 1000) : undefined
        }
      ]
    })
  }

  function changeQty(key: string, delta: number): void {
    setCart((prev) =>
      prev.map((l) => l.key === key ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)
        .filter((l) => l.quantity > 0)
    )
  }

  async function handleCheckout(method: 'cash' | 'card'): Promise<void> {
    if (cart.length === 0) return
    setLoading(true)
    setMessage('')
    try {
      const order = await completeOrder({
        cashierId: user.id,
        cashierName: user.displayName,
        cashierCode: user.cashierCode,
        lines: cart,
        orderNoteAr: orderNote || undefined,
        paymentMethod: method
      })
      const [orderItems, settings] = await Promise.all([getOrderItems(order.id), getSettings()])
      setCart([])
      setOrderNote('')
      setMessage(`تم إتمام الطلب #${orderReference(order)}`)
      printReceipt(order, orderItems, settings).catch((e) => console.warn('[print]', e))
    } catch (e) {
      const code = (e as { code?: string }).code
      setMessage(code === 'permission-denied'
        ? 'صلاحية مرفوضة — شغّل: npm run deploy:rules'
        : e instanceof Error ? e.message : 'فشل إتمام الطلب')
      console.error('[checkout]', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCloseShift(): Promise<void> {
    const shift = await getOpenShiftForCashier(user.id)
    if (!shift) { setMessage('لا يوجد شيفت مفتوح'); return }
    await closeShift(shift.id, user.id)
    setMessage('تم تقفيل الشيفت')
  }

  return (
    <div className="pos-layout">
      <section className="pos-menu">
        <input className="pos-search" placeholder="بحث في القائمة..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="pos-categories">
          <button type="button" className={`pos-cat-btn ${selectedCategory === 'all' ? 'active' : ''}`} onClick={() => setSelectedCategory('all')}>الكل</button>
          {categories.map((c) => (
            <button key={c.id} type="button" className={`pos-cat-btn ${selectedCategory === c.id ? 'active' : ''}`} onClick={() => setSelectedCategory(c.id)}>{c.nameAr}</button>
          ))}
        </div>

        <div className="pos-items">
          {filteredItems.map((item) => {
            const outReason = unavailableItems.get(item.id)
            const isUnavailable = !!outReason
            const isLow = !isUnavailable && lowStockItems.has(item.id)

            if (item.isWeighted) {
              // Weighted item — clicking opens popup
              return (
                <div
                  key={item.id}
                  className={`pos-item-wrap${isUnavailable ? ' pos-item-wrap--unavailable' : ''}${isLow ? ' pos-item-wrap--low' : ''}`}
                >
                  <button
                    type="button"
                    className="pos-item-btn"
                    disabled={isUnavailable}
                    onClick={(e) => {
                      if (isUnavailable) return
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                      setWeightPopup({ item, rect })
                    }}
                  >
                    {item.nameAr}
                    <span className="pos-item-btn__price">{item.price.toFixed(2)} / كجم</span>
                    {isLow && <span className="pos-item-badge pos-item-badge--low">قرب النفاد</span>}
                  </button>
                  {isUnavailable && (
                    <div className="pos-item-overlay">
                      <span className="pos-item-overlay__reason">نفذ: {outReason}</span>
                    </div>
                  )}
                </div>
              )
            }

            // Normal item
            return (
              <div
                key={item.id}
                className={`pos-item-wrap${isUnavailable ? ' pos-item-wrap--unavailable' : ''}${isLow ? ' pos-item-wrap--low' : ''}`}
              >
                <button
                  type="button"
                  className="pos-item-btn"
                  disabled={isUnavailable}
                  onClick={() => addToCart(item)}
                >
                  {item.nameAr}
                  <span className="pos-item-btn__price">{item.price.toFixed(2)}</span>
                  {isLow && <span className="pos-item-badge pos-item-badge--low">قرب النفاد</span>}
                </button>
                {isUnavailable && (
                  <div className="pos-item-overlay">
                    <span className="pos-item-overlay__reason">نفذ: {outReason}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Weight popup */}
      {weightPopup && (
        <WeightPopup
          item={weightPopup.item}
          anchor={weightPopup.rect}
          onSelect={(kg) => addToCart(weightPopup.item, kg)}
          onClose={() => setWeightPopup(null)}
        />
      )}

      <aside className="pos-cart">
        <div className="pos-cart__header">الطلب</div>
        <div className="pos-cart__lines">
          {cart.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 16 }}>أضف أصنافاً من القائمة</p>
          )}
          {cart.map((line) => (
            <div key={line.key} className="cart-line">
              <div>
                <div className="cart-line__name">{line.nameAr}</div>
                <div>
                  {lineTotal(line.unitPrice, line.quantity).toFixed(2)}
                  {line.unitLabel && (
                    <span style={{ color: 'var(--color-muted)', marginInlineStart: 6 }}>({line.quantity.toFixed(3)} {line.unitLabel})</span>
                  )}
                </div>
              </div>
              <div className="cart-line__controls">
                <button type="button" className="qty-btn" onClick={() => changeQty(line.key, -1)}>−</button>
                <span>{line.unitLabel ? line.quantity.toFixed(2) : line.quantity}</span>
                <button type="button" className="qty-btn" onClick={() => changeQty(line.key, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="pos-cart__footer">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleCloseShift()} style={{ width: '100%', marginBottom: 8 }}>
            تقفيل الشيفت
          </button>
          <label className="field">
            <span>ملاحظة على الطلب</span>
            <input value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="اختياري" />
          </label>
          <div className="pos-totals">
            <div className="pos-totals__total"><span>الإجمالي</span><span>{total.toFixed(2)}</span></div>
          </div>
          {message && <p className="form-error">{message}</p>}
          <div className="pos-actions">
            <button type="button" className="btn btn--primary btn--lg" disabled={loading || cart.length === 0} onClick={() => void handleCheckout('cash')}>
              دفع نقدي وطباعة
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
