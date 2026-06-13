import { useEffect, useState } from 'react'
import type { Order, OrderItem } from '@shared/types'
import {
  cancelOrder,
  getOrderItems,
  getSettings,
  listOrders,
  markOrderPaid,
  editOrderItems,
  type CartLine
} from '@renderer/features/orders/order-service'
import { printReceipt } from '@renderer/features/receipt/receipt-builder'
import { orderReference } from '@shared/services/order-reference'
import { useAuthStore } from '@renderer/features/auth/auth-store'

interface OrderDetails {
  order: Order
  items: OrderItem[]
}

function isOrderUnpaid(order: Order): boolean {
  return order.status === 'draft' || order.paymentStatus === 'unpaid'
}

function orderStatusLabel(order: Order): string {
  if (order.status === 'cancelled') return 'ملغي'
  if (order.paymentStatus === 'split') return 'تقسيم'
  return isOrderUnpaid(order) ? 'غير مدفوع' : 'مدفوع'
}

function orderPlaceLabel(order: Order): string {
  if (order.orderType === 'delivery') return `دليفري${order.customerName ? ` — ${order.customerName}` : ''}`
  if (!order.tableNameAr) return 'تيك أواي'
  return `${order.tableNameAr}${order.tableCategoryAr ? ` - ${order.tableCategoryAr}` : ''}`
}

export function OrderHistoryPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user)!
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<OrderDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [message, setMessage] = useState('')
  // Split payment modal
  const [splitModal, setSplitModal] = useState<Order | null>(null)
  const [splitCash, setSplitCash] = useState('')
  const [splitCard, setSplitCard] = useState('')
  // Edit order
  const [editModal, setEditModal] = useState<{ order: Order; items: OrderItem[] } | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  async function load(): Promise<void> {
    const loadedOrders = await listOrders(200)
    setOrders(loadedOrders.filter((o) => o.status === 'draft' || o.status === 'completed' || o.status === 'cancelled'))
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function openDetails(order: Order): Promise<void> {
    setLoadingDetails(true)
    const items = await getOrderItems(order.id)
    setDetails({ order, items })
    setLoadingDetails(false)
  }

  async function reprint(order: Order): Promise<void> {
    const [items, settings] = await Promise.all([getOrderItems(order.id), getSettings()])
    await printReceipt(order, items, settings)
  }

  async function handleCancel(order: Order): Promise<void> {
    const wasted = window.confirm('هل مخزون هذا الطلب هدر؟\nموافق = هدر | إلغاء = يرجع للمخزون')
    const reasonAr = window.prompt('سبب الإلغاء (اختياري)') ?? undefined
    await cancelOrder({ orderId: order.id, cancelledBy: user.id, reasonAr, inventoryMode: wasted ? 'waste' : 'return' })
    setMessage('تم إلغاء الطلب')
    await load()
  }

  async function handleMarkPaid(order: Order, method: 'cash' | 'card'): Promise<void> {
    const paid = await markOrderPaid({ orderId: order.id, cashierId: user.id, paymentMethod: method })
    if (!paid) return
    const [items, settings] = await Promise.all([getOrderItems(paid.id), getSettings()])
    setMessage('تم تسجيل الدفع')
    await load()
    await printReceipt(paid, items, settings)
  }

  async function handleSplitPay(): Promise<void> {
    if (!splitModal) return
    const cash = Number(splitCash) || 0
    const card = Number(splitCard) || 0
    if (cash + card < splitModal.total - 0.01) { setMessage('مجموع الدفع أقل من الإجمالي'); return }
    const paid = await markOrderPaid({ orderId: splitModal.id, cashierId: user.id, paymentMethod: 'split', cashPaid: cash, cardPaid: card })
    if (!paid) return
    const [items, settings] = await Promise.all([getOrderItems(paid.id), getSettings()])
    setSplitModal(null); setSplitCash(''); setSplitCard('')
    setMessage('تم تسجيل الدفع المقسم')
    await load()
    await printReceipt(paid, items, settings)
  }

  async function openEditModal(order: Order): Promise<void> {
    const items = await getOrderItems(order.id)
    setEditModal({ order, items })
  }

  async function handleEditQtyChange(itemId: string, delta: number): Promise<void> {
    if (!editModal) return
    setEditModal((prev) => {
      if (!prev) return prev
      const updated = prev.items.map((i) => i.id === itemId ? { ...i, quantity: Math.max(0, i.quantity + delta), lineTotal: i.unitPrice * Math.max(0, i.quantity + delta) } : i).filter((i) => i.quantity > 0)
      return { ...prev, items: updated }
    })
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editModal) return
    setEditSaving(true)
    try {
      const lines: CartLine[] = editModal.items.map((i) => ({
        menuItemId: i.menuItemId, nameAr: i.nameAr, unitPrice: i.unitPrice,
        quantity: i.quantity, sizeLabelAr: i.sizeLabelAr, unitLabel: i.unitLabel,
        weightGrams: i.weightGrams, noteAr: i.noteAr
      }))
      await editOrderItems({ orderId: editModal.order.id, cashierId: user.id, lines, orderNoteAr: editModal.order.noteAr })
      setEditModal(null)
      setMessage('تم تعديل الطلب')
      await load()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'فشل التعديل') }
    finally { setEditSaving(false) }
  }

  if (loading) return <p className="app-loading">جاري التحميل...</p>

  const currency = 'ج.م'

  return (
    <>
      <div className="card">
        <h2 className="card__title">سجل الطلبات</h2>
        {message && <p className="form-message form-message--ok">{message}</p>}
        <table className="data-table">
          <thead>
            <tr><th>رقم الطلب</th><th>الحالة</th><th>المكان</th><th>التاريخ</th><th>الكاشير</th><th>الإجمالي</th><th></th></tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>لا توجد طلبات</td></tr>
            ) : orders.map((order) => {
              const unpaid = isOrderUnpaid(order)
              const canEdit = order.status === 'draft' && order.paymentStatus === 'unpaid'
              return (
                <tr key={order.id} className={unpaid ? 'order-row--unpaid' : ''}>
                  <td>#{orderReference(order)}</td>
                  <td><span className={`order-status-pill${unpaid ? ' order-status-pill--unpaid' : ''}`}>{orderStatusLabel(order)}</span></td>
                  <td>{orderPlaceLabel(order)}</td>
                  <td style={{ fontSize: '0.82rem' }}>{new Date(order.completedAt ?? order.createdAt).toLocaleString('ar-EG')}</td>
                  <td>{order.cashierName}</td>
                  <td>
                    {order.discountAmount ? <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>خصم: -{order.discountAmount.toFixed(2)}</div> : null}
                    {order.total.toFixed(2)} {currency}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => void openDetails(order)} disabled={loadingDetails}>تفاصيل</button>
                      {!unpaid && order.status !== 'cancelled' && <button type="button" className="btn btn--secondary btn--sm" onClick={() => void reprint(order)}>طباعة</button>}
                      {canEdit && <button type="button" className="btn btn--secondary btn--sm" onClick={() => void openEditModal(order)}>تعديل</button>}
                      {unpaid && order.status !== 'cancelled' && (
                        <>
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => void handleMarkPaid(order, 'cash')}>نقدي</button>
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleMarkPaid(order, 'card')}>بطاقة</button>
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setSplitModal(order); setSplitCash(''); setSplitCard('') }}>تقسيم</button>
                        </>
                      )}
                      {order.status !== 'cancelled' && <button type="button" className="btn btn--danger btn--sm" onClick={() => void handleCancel(order)}>إلغاء</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Details modal */}
      {details && (
        <div className="modal-overlay" onClick={() => setDetails(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="order-details__header">
              <h2 className="order-details__title">طلب #{orderReference(details.order)}</h2>
              <button type="button" className="order-details__close" onClick={() => setDetails(null)}>✕</button>
            </div>
            <div className="order-details__meta">
              <div className="order-details__meta-row"><span className="order-details__meta-label">التاريخ</span><span>{new Date(details.order.completedAt ?? details.order.createdAt).toLocaleString('ar-EG')}</span></div>
              <div className="order-details__meta-row"><span className="order-details__meta-label">الكاشير</span><span>{details.order.cashierName}</span></div>
              <div className="order-details__meta-row"><span className="order-details__meta-label">النوع</span><span>{orderPlaceLabel(details.order)}</span></div>
              {details.order.orderType === 'delivery' && details.order.customerPhone && (
                <div className="order-details__meta-row"><span className="order-details__meta-label">هاتف العميل</span><span dir="ltr">{details.order.customerPhone}</span></div>
              )}
              {details.order.orderType === 'delivery' && details.order.customerAddress && (
                <div className="order-details__meta-row"><span className="order-details__meta-label">العنوان</span><span>{details.order.customerAddress}</span></div>
              )}
              {details.order.noteAr && <div className="order-details__meta-row"><span className="order-details__meta-label">ملاحظة</span><span>{details.order.noteAr}</span></div>}
            </div>
            <table className="data-table" style={{ marginTop: 12 }}>
              <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
              <tbody>
                {details.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.nameAr}{item.sizeLabelAr && <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>{item.sizeLabelAr}</div>}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unitPrice.toFixed(2)} {currency}</td>
                    <td>{item.lineTotal.toFixed(2)} {currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="order-details__totals">
              {details.order.discountAmount ? <div className="order-details__total-row" style={{ color: 'var(--color-danger)' }}><span>خصم</span><span>- {details.order.discountAmount.toFixed(2)} {currency}</span></div> : null}
              {details.order.taxAmount ? <div className="order-details__total-row"><span>ضريبة ({details.order.taxRate}%)</span><span>{details.order.taxAmount.toFixed(2)} {currency}</span></div> : null}
              {details.order.deliveryFee ? <div className="order-details__total-row"><span>رسوم التوصيل</span><span>{details.order.deliveryFee.toFixed(2)} {currency}</span></div> : null}
              <div className="order-details__total-row"><span>الإجمالي</span><strong>{details.order.total.toFixed(2)} {currency}</strong></div>
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void reprint(details.order)}>طباعة الإيصال</button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDetails(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Split payment modal */}
      {splitModal && (
        <div className="modal-overlay" onClick={() => setSplitModal(null)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="order-details__header">
              <h2 className="order-details__title">دفع مقسم — #{orderReference(splitModal)}</h2>
              <button type="button" className="order-details__close" onClick={() => setSplitModal(null)}>✕</button>
            </div>
            <p style={{ margin: '0 0 12px', fontWeight: 700 }}>الإجمالي: {splitModal.total.toFixed(2)} {currency}</p>
            <label className="field"><span>نقدي</span><input type="number" min="0" step="0.01" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} autoFocus /></label>
            <label className="field"><span>بطاقة</span><input type="number" min="0" step="0.01" value={splitCard} onChange={(e) => setSplitCard(e.target.value)} /></label>
            {message && <p className="form-error">{message}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn--primary" onClick={() => void handleSplitPay()}>تأكيد الدفع</button>
              <button type="button" className="btn btn--secondary" onClick={() => setSplitModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit order modal */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="order-details__header">
              <h2 className="order-details__title">تعديل طلب #{orderReference(editModal.order)}</h2>
              <button type="button" className="order-details__close" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', marginBottom: 12 }}>غيّر الكميات أو احذف أصنافاً ثم احفظ</p>
            <table className="data-table">
              <thead><tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th><th></th></tr></thead>
              <tbody>
                {editModal.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.nameAr}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button type="button" className="qty-btn" onClick={() => void handleEditQtyChange(item.id, -1)}>-</button>
                        <span>{item.quantity}</span>
                        <button type="button" className="qty-btn" onClick={() => void handleEditQtyChange(item.id, 1)}>+</button>
                      </div>
                    </td>
                    <td>{(item.unitPrice * item.quantity).toFixed(2)}</td>
                    <td><button type="button" className="btn btn--danger btn--sm" onClick={() => void handleEditQtyChange(item.id, -item.quantity)}>حذف</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--primary" onClick={() => void handleSaveEdit()} disabled={editSaving || editModal.items.length === 0}>
                {editSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => setEditModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
