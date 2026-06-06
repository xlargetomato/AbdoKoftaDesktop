import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MenuCategory, MenuItem } from '@shared/types'
import { listCategories, listMenuItems } from '@renderer/features/menu/menu-service'
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

interface LocalCartLine extends CartLine {
  key: string
}

export function PosPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user)!
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<LocalCartLine[]>([])
  const [orderNote, setOrderNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [cats, menu] = await Promise.all([
      listCategories(),
      listMenuItems(true)
    ])
    setCategories(cats.filter((c) => c.active))
    setItems(menu)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredItems = useMemo(() => {
    let list = items
    if (selectedCategory !== 'all') {
      list = list.filter((i) => i.categoryId === selectedCategory)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((i) => i.nameAr.toLowerCase().includes(q))
    }
    return list
  }, [items, selectedCategory, search])

  const subtotal = orderSubtotal(cart)
  const total = orderTotal(subtotal)

  function addToCart(item: MenuItem): void {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id)
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id
            ? { ...l, quantity: l.quantity + 1 }
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
          quantity: 1
        }
      ]
    })
  }

  function changeQty(key: string, delta: number): void {
    setCart((prev) =>
      prev
        .map((l) =>
          l.key === key ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l
        )
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
        lines: cart,
        orderNoteAr: orderNote || undefined,
        paymentMethod: method
      })
      const [orderItems, settings] = await Promise.all([
        getOrderItems(order.id),
        getSettings()
      ])
      // Clear cart immediately — don't wait for print dialog
      setCart([])
      setOrderNote('')
      setMessage(`تم إتمام الطلب #${orderReference(order)}`)
      // Fire print in background — failure won't affect the order
      printReceipt(order, orderItems, settings).catch((e) => {
        console.warn('[print]', e)
      })
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'permission-denied') {
        setMessage(
          'صلاحية مرفوضة — شغّل: npm run deploy:rules ثم أعد المحاولة'
        )
      } else {
        setMessage(e instanceof Error ? e.message : 'فشل إتمام الطلب')
      }
      console.error('[checkout]', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pos-layout">
      <section className="pos-menu">
        <input
          className="pos-search"
          placeholder="بحث في القائمة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="pos-categories">
          <button
            type="button"
            className={`pos-cat-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            الكل
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`pos-cat-btn ${selectedCategory === c.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(c.id)}
            >
              {c.nameAr}
            </button>
          ))}
        </div>
        <div className="pos-items">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="pos-item-btn"
              onClick={() => addToCart(item)}
            >
              {item.nameAr}
              <span className="pos-item-btn__price">{item.price.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="pos-cart">
        <div className="pos-cart__header">الطلب</div>
        <div className="pos-cart__lines">
          {cart.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
              أضف أصنافاً من القائمة
            </p>
          )}
          {cart.map((line) => (
            <div key={line.key} className="cart-line">
              <div>
                <div className="cart-line__name">{line.nameAr}</div>
                <div>{lineTotal(line.unitPrice, line.quantity).toFixed(2)}</div>
              </div>
              <div className="cart-line__controls">
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => changeQty(line.key, -1)}
                >
                  −
                </button>
                <span>{line.quantity}</span>
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => changeQty(line.key, 1)}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="pos-cart__footer">
          <label className="field">
            <span>ملاحظة على الطلب</span>
            <input
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="اختياري"
            />
          </label>
          <div className="pos-totals">
            <div className="pos-totals__total">
              <span>الإجمالي</span>
              <span>{total.toFixed(2)}</span>
            </div>
          </div>
          {message && <p className="form-error">{message}</p>}
          <div className="pos-actions">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={loading || cart.length === 0}
              onClick={() => void handleCheckout('cash')}
            >
              دفع نقدي وطباعة
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
