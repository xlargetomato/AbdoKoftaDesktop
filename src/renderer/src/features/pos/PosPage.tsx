import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DiningTable, MenuCategory, MenuItem, MenuItemSizeOption, Order, OrderType } from '@shared/types'
import { getIngredientStocks } from '@renderer/features/inventory/inventory-service'
import { listCategories, listMenuItems, getRecipeByMenuItem } from '@renderer/features/menu/menu-service'
import {
  completeOrder,
  getSettings,
  listUnpaidDineInOrders,
  type CartLine
} from '@renderer/features/orders/order-service'
import { getOrderItems } from '@renderer/features/orders/order-service'
import { listDiningTables } from '@renderer/features/tables/table-service'
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
  parentKey?: string
}

interface WeightPopupProps {
  item: MenuItem
  anchor: DOMRect
  onSelect: (kg: number, unitPrice: number) => void
  onClose: () => void
}

interface SizePopupProps {
  item: MenuItem
  anchor: DOMRect
  onSelect: (size: MenuItemSizeOption) => void
  onClose: () => void
}

function FloatingPopup({
  anchor,
  onClose,
  children
}: {
  anchor: DOMRect
  onClose: () => void
  children: React.ReactNode
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="weight-popup"
      style={{
        position: 'fixed',
        zIndex: 500,
        left: anchor.left,
        top: anchor.bottom + 6,
        minWidth: Math.max(anchor.width || 160, 220)
      }}
    >
      {children}
    </div>
  )
}

function WeightPopup({ item, anchor, onSelect, onClose }: WeightPopupProps): React.ReactElement {
  const [customGrams, setCustomGrams] = useState('')
  const options = item.weightedPriceOptions ?? []
  const customUnitPrice = item.customWeightUnitPrice ?? item.price

  return (
    <FloatingPopup anchor={anchor} onClose={onClose}>
      <div className="weight-popup__header">
        <span>{item.nameAr}</span>
        <span className="weight-popup__price">
          {item.allowCustomWeight ? `${customUnitPrice.toFixed(2)} / كجم مخصص` : 'أسعار محددة'}
        </span>
      </div>
      {options.length > 0 ? (
        <div className="weight-popup__shortcuts">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="weight-popup__btn"
              onClick={() => { onSelect(option.weightKg, option.price / option.weightKg); onClose() }}
            >
              <span>{option.label}</span>
              <span>{option.price.toFixed(2)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="weight-popup__empty">لا توجد أسعار محددة لهذا الصنف</p>
      )}
      {item.allowCustomWeight && (
        <div className="weight-popup__custom">
          <input
            type="number"
            min="1"
            step="1"
            value={customGrams}
            onChange={(e) => setCustomGrams(e.target.value)}
            placeholder="جرام"
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              const grams = Number(customGrams)
              if (grams <= 0) return
              onSelect(grams / 1000, customUnitPrice)
              onClose()
            }}
          >
            إضافة
          </button>
        </div>
      )}
    </FloatingPopup>
  )
}

function SizePopup({ item, anchor, onSelect, onClose }: SizePopupProps): React.ReactElement {
  return (
    <FloatingPopup anchor={anchor} onClose={onClose}>
      <div className="weight-popup__header">
        <span>{item.nameAr}</span>
        <span className="weight-popup__price">اختر الحجم</span>
      </div>
      <div className="weight-popup__shortcuts">
        {(item.sizeOptions ?? []).map((size) => (
          <button
            key={size.id}
            type="button"
            className="weight-popup__btn"
            onClick={() => { onSelect(size); onClose() }}
          >
            <span>{size.labelAr}</span>
            <span>{size.price.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </FloatingPopup>
  )
}

export function PosPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user)!
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [unavailableItems, setUnavailableItems] = useState<Map<string, string>>(new Map())
  const [lowStockItems, setLowStockItems] = useState<Set<string>>(new Set())
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<LocalCartLine[]>([])
  const [orderType, setOrderType] = useState<OrderType>('takeaway')
  const [tables, setTables] = useState<DiningTable[]>([])
  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([])
  const [selectedTableId, setSelectedTableId] = useState('')
  const [tablePopupOpen, setTablePopupOpen] = useState(false)
  const [orderNote, setOrderNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [weightPopup, setWeightPopup] = useState<{ item: MenuItem; rect: DOMRect } | null>(null)
  const [sizePopup, setSizePopup] = useState<{ item: MenuItem; rect: DOMRect } | null>(null)

  const load = useCallback(async () => {
    const [cats, menu, stocks, diningTables, unpaid] = await Promise.all([
      listCategories(),
      listMenuItems(true),
      getIngredientStocks(),
      listDiningTables(),
      listUnpaidDineInOrders()
    ])
    setCategories(cats.filter((category) => category.active))
    setItems(menu)
    setTables(diningTables)
    setUnpaidOrders(unpaid)
    if (diningTables.length > 0) setSelectedTableId((prev) => prev || diningTables[0]!.id)

    const outOfStock = new Map<string, string>()
    const lowStock = new Set<string>()
    for (const stock of stocks) {
      if (stock.quantity <= 0) outOfStock.set(stock.ingredientId, stock.nameAr)
      else if (stock.lowStockThreshold != null && stock.quantity <= stock.lowStockThreshold) lowStock.add(stock.ingredientId)
    }

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
          if (lowStock.has(line.ingredientId)) lowItems.add(item.id)
        }
      })
    )
    setUnavailableItems(unavailable)
    setLowStockItems(lowItems)
  }, [])

  useEffect(() => { void load() }, [load])

  const categoryChildren = useMemo(() => {
    const children = new Map<string, MenuCategory[]>()
    for (const category of categories) {
      if (!category.parentId) continue
      children.set(category.parentId, [...(children.get(category.parentId) ?? []), category])
    }
    return children
  }, [categories])

  const filteredItems = useMemo(() => {
    let list = items
    if (selectedCategory !== 'all') {
      const visibleIds = new Set([
        selectedCategory,
        ...(categoryChildren.get(selectedCategory)?.map((category) => category.id) ?? [])
      ])
      list = list.filter((item) => visibleIds.has(item.categoryId))
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase()
      list = list.filter((item) => item.nameAr.toLowerCase().includes(query))
    }
    return list
  }, [categoryChildren, items, selectedCategory, search])

  const subtotal = orderSubtotal(cart)
  const total = orderTotal(subtotal)
  const occupiedTableIds = useMemo(
    () => new Set(unpaidOrders.map((order) => order.tableId).filter(Boolean) as string[]),
    [unpaidOrders]
  )
  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId),
    [tables, selectedTableId]
  )
  const groupedTables = useMemo(() => {
    const groups = new Map<string, DiningTable[]>()
    for (const table of tables) {
      const key = table.categoryAr?.trim() || 'بدون تصنيف'
      groups.set(key, [...(groups.get(key) ?? []), table])
    }
    return Array.from(groups.entries()).map(([category, categoryTables]) => ({
      category,
      tables: categoryTables
    }))
  }, [tables])

  function cartKey(item: MenuItem, quantity: number, unitPrice: number, size?: MenuItemSizeOption): string {
    if (item.isWeighted) return `${item.id}:w:${quantity.toFixed(3)}:${unitPrice.toFixed(4)}`
    if (size) return `${item.id}:s:${size.id}`
    return item.id
  }

  function addToCart(item: MenuItem, quantity = 1, unitPrice = item.price, size?: MenuItemSizeOption): void {
    if (unavailableItems.has(item.id)) return
    const key = cartKey(item, quantity, unitPrice, size)
    const mainLine: LocalCartLine = {
      key,
      menuItemId: item.id,
      nameAr: item.nameAr,
      unitPrice,
      quantity,
      sizeLabelAr: size?.labelAr,
      unitLabel: item.isWeighted ? 'كجم' : undefined,
      weightGrams: item.isWeighted ? Math.round(quantity * 1000) : undefined
    }
    const attachmentLines: LocalCartLine[] = (item.attachments ?? []).map((attachment) => ({
      key: `${key}:att:${attachment.id}`,
      parentKey: key,
      menuItemId: `${item.id}:attachment:${attachment.id}`,
      attachmentForMenuItemId: item.id,
      nameAr: `+ ${attachment.nameAr}`,
      unitPrice: attachment.price,
      quantity
    }))

    setCart((prev) => {
      const existing = prev.find((line) => line.key === key)
      if (existing) {
        return prev.map((line) => {
          if (line.key === key || line.parentKey === key) {
            const nextQty = line.quantity + quantity
            return {
              ...line,
              quantity: nextQty,
              weightGrams: line.unitLabel ? Math.round(nextQty * 1000) : line.weightGrams
            }
          }
          return line
        })
      }
      return [...prev, mainLine, ...attachmentLines]
    })
  }

  function changeQty(key: string, delta: number): void {
    setCart((prev) => {
      const target = prev.find((line) => line.key === key)
      const affectedParentKey = target?.parentKey ? key : key
      return prev
        .map((line) => {
          if (line.key !== affectedParentKey && line.parentKey !== affectedParentKey) return line
          const nextQty = Math.max(0, line.quantity + delta)
          return {
            ...line,
            quantity: nextQty,
            weightGrams: line.unitLabel ? Math.round(nextQty * 1000) : line.weightGrams
          }
        })
        .filter((line) => line.quantity > 0)
    })
  }

  async function handleCheckout(method?: 'cash' | 'card'): Promise<void> {
    if (cart.length === 0) return
    if (orderType === 'dine_in') {
      if (!selectedTable) {
        setMessage('اختر ترابيزة لطلب الصالة')
        return
      }
      if (occupiedTableIds.has(selectedTable.id)) {
        const shouldContinue = window.confirm(
          `الترابيزة ${selectedTable.nameAr} عليها طلب غير مدفوع. هل تريد إضافة طلب جديد عليها؟`
        )
        if (!shouldContinue) return
      }
    }
    setLoading(true)
    setMessage('')
    try {
      const order = await completeOrder({
        cashierId: user.id,
        cashierName: user.displayName,
        cashierCode: user.cashierCode,
        lines: cart,
        orderNoteAr: orderNote || undefined,
        orderType,
        table: orderType === 'dine_in' && selectedTable
          ? {
              id: selectedTable.id,
              nameAr: selectedTable.nameAr,
              categoryAr: selectedTable.categoryAr
            }
          : undefined,
        paymentMethod: method
      })
      const [orderItems, settings, unpaid] = await Promise.all([
        getOrderItems(order.id),
        getSettings(),
        listUnpaidDineInOrders()
      ])
      setCart([])
      setOrderNote('')
      setUnpaidOrders(unpaid)
      setMessage(
        orderType === 'dine_in'
          ? `تم إنشاء طلب صالة غير مدفوع #${orderReference(order)}`
          : orderType === 'delivery'
            ? `تم إنشاء طلب دليفري غير مدفوع #${orderReference(order)}`
            : `تم إتمام الطلب #${orderReference(order)}`
      )
      if (orderType === 'takeaway' || orderType === 'delivery') {
        printReceipt(order, orderItems, settings).catch((e) => console.warn('[print]', e))
      }
    } catch (e) {
      const code = (e as { code?: string }).code
      setMessage(code === 'permission-denied'
        ? 'صلاحية مرفوضة - شغّل: npm run deploy:rules'
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
          {categories.filter((category) => !category.parentId).map((category) => (
            <div key={category.id} className="pos-category-group">
              <button type="button" className={`pos-cat-btn ${selectedCategory === category.id ? 'active' : ''}`} onClick={() => setSelectedCategory(category.id)}>{category.nameAr}</button>
              {categoryChildren.get(category.id)?.map((child) => (
                <button key={child.id} type="button" className={`pos-cat-btn ${selectedCategory === child.id ? 'active' : ''}`} onClick={() => setSelectedCategory(child.id)}>{child.nameAr}</button>
              ))}
            </div>
          ))}
          {categories.filter((category) => category.parentId && !categories.some((parent) => parent.id === category.parentId)).map((category) => (
            <button key={category.id} type="button" className={`pos-cat-btn ${selectedCategory === category.id ? 'active' : ''}`} onClick={() => setSelectedCategory(category.id)}>{category.nameAr}</button>
          ))}
        </div>

        <div className="pos-items">
          {filteredItems.map((item) => {
            const outReason = unavailableItems.get(item.id)
            const isUnavailable = !!outReason
            const isLow = !isUnavailable && lowStockItems.has(item.id)
            const hasSizes = !item.isWeighted && (item.sizeOptions?.length ?? 0) > 0
            const priceLabel = item.isWeighted
              ? item.allowCustomWeight
                ? `${(item.customWeightUnitPrice ?? item.price).toFixed(2)} / كجم مخصص`
                : 'أسعار محددة'
              : hasSizes
                ? 'أحجام'
                : item.price.toFixed(2)

            return (
              <div key={item.id} className={`pos-item-wrap${isUnavailable ? ' pos-item-wrap--unavailable' : ''}${isLow ? ' pos-item-wrap--low' : ''}`}>
                <button
                  type="button"
                  className="pos-item-btn"
                  disabled={isUnavailable}
                  onClick={(e) => {
                    if (isUnavailable) return
                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                    if (item.isWeighted) setWeightPopup({ item, rect })
                    else if (hasSizes) setSizePopup({ item, rect })
                    else addToCart(item)
                  }}
                >
                  {item.nameAr}
                  <span className="pos-item-btn__price">{priceLabel}</span>
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

      {weightPopup && (
        <WeightPopup
          item={weightPopup.item}
          anchor={weightPopup.rect}
          onSelect={(kg, unitPrice) => addToCart(weightPopup.item, kg, unitPrice)}
          onClose={() => setWeightPopup(null)}
        />
      )}
      {sizePopup && (
        <SizePopup
          item={sizePopup.item}
          anchor={sizePopup.rect}
          onSelect={(size) => addToCart(sizePopup.item, 1, size.price, size)}
          onClose={() => setSizePopup(null)}
        />
      )}

      {tablePopupOpen && (
        <div className="modal-overlay" onClick={() => setTablePopupOpen(false)}>
          <div className="modal table-select-modal" onClick={(e) => e.stopPropagation()}>
            <div className="order-details__header">
              <h2 className="order-details__title">اختيار الترابيزة</h2>
              <button
                type="button"
                className="order-details__close"
                onClick={() => setTablePopupOpen(false)}
                aria-label="إغلاق"
              >
                x
              </button>
            </div>
            {groupedTables.length === 0 ? (
              <p className="table-picker__empty">لا توجد ترابيزات مفعلة</p>
            ) : (
              <div className="table-category-list">
                {groupedTables.map((group) => (
                  <section key={group.category} className="table-category-group">
                    <h3>{group.category}</h3>
                    <div className="table-picker table-picker--modal">
                      {group.tables.map((table) => {
                        const occupied = occupiedTableIds.has(table.id)
                        return (
                          <button
                            key={table.id}
                            type="button"
                            className={`table-picker__btn${selectedTableId === table.id ? ' table-picker__btn--active' : ''}${occupied ? ' table-picker__btn--occupied' : ''}`}
                            onClick={() => {
                              setSelectedTableId(table.id)
                              setTablePopupOpen(false)
                            }}
                            title={occupied ? 'عليها طلب غير مدفوع' : undefined}
                          >
                            <strong>{table.nameAr}</strong>
                            {occupied && <span>مشغولة</span>}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <aside className="pos-cart">
        <div className="pos-cart__header">الطلب</div>
        <div className="order-service-panel">
          <div className="order-type-toggle">
            <button
              type="button"
              className={`order-type-toggle__btn${orderType === 'takeaway' ? ' order-type-toggle__btn--active' : ''}`}
              onClick={() => setOrderType('takeaway')}
            >
              تيك أواي
            </button>
            <button
              type="button"
              className={`order-type-toggle__btn${orderType === 'dine_in' ? ' order-type-toggle__btn--active' : ''}`}
              onClick={() => setOrderType('dine_in')}
            >
              صالة
            </button>
            <button
              type="button"
              className={`order-type-toggle__btn${orderType === 'delivery' ? ' order-type-toggle__btn--active' : ''}`}
              onClick={() => setOrderType('delivery')}
            >
              دليفري
            </button>
          </div>
          {orderType === 'dine_in' && (
            <button
              type="button"
              className={`table-picker-trigger${selectedTable ? ' table-picker-trigger--selected' : ''}${selectedTable && occupiedTableIds.has(selectedTable.id) ? ' table-picker-trigger--occupied' : ''}`}
              onClick={() => setTablePopupOpen(true)}
            >
              <span>الترابيزة</span>
              <strong>
                {selectedTable
                  ? `${selectedTable.nameAr}${selectedTable.categoryAr ? ` - ${selectedTable.categoryAr}` : ''}`
                  : tables.length ? 'اختيار ترابيزة' : 'لا توجد ترابيزات'}
              </strong>
            </button>
          )}
        </div>
        <div className="pos-cart__lines">
          {cart.length === 0 && <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 16 }}>أضف أصنافًا من القائمة</p>}
          {cart.map((line) => (
            <div key={line.key} className={`cart-line${line.parentKey ? ' cart-line--attachment' : ''}`}>
              <div>
                <div className="cart-line__name">{line.nameAr}</div>
                <div>
                  {lineTotal(line.unitPrice, line.quantity).toFixed(2)}
                  {line.sizeLabelAr && <span style={{ color: 'var(--color-muted)', marginInlineStart: 6 }}>({line.sizeLabelAr})</span>}
                  {line.unitLabel && <span style={{ color: 'var(--color-muted)', marginInlineStart: 6 }}>({line.quantity.toFixed(3)} {line.unitLabel})</span>}
                </div>
              </div>
              <div className="cart-line__controls">
                {!line.parentKey && <button type="button" className="qty-btn" onClick={() => changeQty(line.key, -1)}>-</button>}
                <span>{line.unitLabel ? line.quantity.toFixed(2) : line.quantity}</span>
                {!line.parentKey && <button type="button" className="qty-btn" onClick={() => changeQty(line.key, 1)}>+</button>}
              </div>
            </div>
          ))}
        </div>
        <div className="pos-cart__footer">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleCloseShift()} style={{ width: '100%', marginBottom: 8 }}>
            تقفيل الشيفت
          </button>
          <textarea className="order-note" placeholder="ملاحظة على الطلب..." value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
          <div className="cart-summary">
            <div><span>الإجمالي</span><strong>{total.toFixed(2)}</strong></div>
          </div>
          {message && <p className={`form-message ${message.includes('فشل') || message.includes('مرفوضة') ? 'form-message--error' : 'form-message--ok'}`}>{message}</p>}
          <div className="checkout-actions">
            {orderType === 'takeaway' ? (
              <>
                <button type="button" className="btn btn--primary" disabled={loading || cart.length === 0} onClick={() => void handleCheckout('cash')}>نقدي</button>
                <button type="button" className="btn btn--secondary" disabled={loading || cart.length === 0} onClick={() => void handleCheckout('card')}>بطاقة</button>
              </>
            ) : orderType === 'dine_in' ? (
              <button type="button" className="btn btn--primary" disabled={loading || cart.length === 0 || !selectedTable} onClick={() => void handleCheckout()}>
                إنشاء طلب صالة
              </button>
            ) : (
              <button type="button" className="btn btn--primary" disabled={loading || cart.length === 0} onClick={() => void handleCheckout()}>
                إنشاء طلب دليفري
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
