import { useEffect, useState } from 'react'
import type { Order, OrderItem } from '@shared/types'
import {
  cancelOrder,
  getOrderItems,
  getSettings,
  listOrders,
  markOrderPaid
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
  return isOrderUnpaid(order) ? 'غير مدفوع' : 'مدفوع'
}

function orderPlaceLabel(order: Order): string {
  if (order.orderType === 'delivery') return 'دليفري'
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

  async function load(): Promise<void> {
    const loadedOrders = await listOrders(100)
    setOrders(
      loadedOrders.filter((order) =>
        order.status === 'draft' ||
        order.status === 'completed' ||
        order.status === 'cancelled'
      )
    )
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function openDetails(order: Order): Promise<void> {
    setLoadingDetails(true)
    const items = await getOrderItems(order.id)
    setDetails({ order, items })
    setLoadingDetails(false)
  }

  async function reprint(order: Order): Promise<void> {
    const [items, settings] = await Promise.all([
      getOrderItems(order.id),
      getSettings()
    ])
    await printReceipt(order, items, settings)
  }

  async function handleCancel(order: Order): Promise<void> {
    const wasted = window.confirm(
      'هل يعتبر مخزون هذا الطلب هدر؟\nموافق = هدر ولا يرجع للمخزون\nإلغاء = يرجع للمخزون'
    )
    const reasonAr = window.prompt('سبب الإلغاء', '') ?? undefined
    await cancelOrder({
      orderId: order.id,
      cancelledBy: user.id,
      reasonAr,
      inventoryMode: wasted ? 'waste' : 'return'
    })
    setMessage('تم إلغاء الطلب')
    await load()
  }

  async function handleMarkPaid(order: Order, paymentMethod: 'cash' | 'card'): Promise<void> {
    const paid = await markOrderPaid({
      orderId: order.id,
      cashierId: user.id,
      paymentMethod
    })
    if (!paid) return
    const [items, settings] = await Promise.all([
      getOrderItems(paid.id),
      getSettings()
    ])
    setMessage('تم تسجيل دفع الطلب')
    await load()
    await printReceipt(paid, items, settings)
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
            <tr>
              <th>رقم الطلب</th>
              <th>الحالة</th>
              <th>الترابيزة</th>
              <th>التاريخ</th>
              <th>الكاشير</th>
              <th>الإجمالي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                  لا توجد طلبات
                </td>
              </tr>
            ) : orders.map((order) => {
              const unpaid = isOrderUnpaid(order)
              return (
                <tr key={order.id} className={unpaid ? 'order-row--unpaid' : ''}>
                  <td>#{orderReference(order)}</td>
                  <td>
                    <span className={`order-status-pill${unpaid ? ' order-status-pill--unpaid' : ''}`}>
                      {orderStatusLabel(order)}
                    </span>
                  </td>
                  <td>{orderPlaceLabel(order)}</td>
                  <td>{new Date(order.completedAt ?? order.createdAt).toLocaleString('ar-EG')}</td>
                  <td>{order.cashierName}</td>
                  <td>{order.total.toFixed(2)} {currency}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => void openDetails(order)}
                        disabled={loadingDetails}
                      >
                        تفاصيل
                      </button>
                      {!unpaid && (
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => void reprint(order)}
                        >
                          طباعة
                        </button>
                      )}
                      {unpaid && order.status !== 'cancelled' && (
                        <>
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => void handleMarkPaid(order, 'cash')}>دفع نقدي</button>
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleMarkPaid(order, 'card')}>دفع بطاقة</button>
                        </>
                      )}
                      {order.status !== 'cancelled' && (
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => void handleCancel(order)}>إلغاء</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {details && (
        <div className="modal-overlay" onClick={() => setDetails(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="order-details__header">
              <h2 className="order-details__title">
                طلب #{orderReference(details.order)}
              </h2>
              <button
                type="button"
                className="order-details__close"
                onClick={() => setDetails(null)}
                aria-label="إغلاق"
              >
                x
              </button>
            </div>

            <div className="order-details__meta">
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">التاريخ</span>
                <span>{new Date(details.order.completedAt ?? details.order.createdAt).toLocaleString('ar-EG')}</span>
              </div>
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">الكاشير</span>
                <span>{details.order.cashierName}</span>
              </div>
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">النوع</span>
                <span>{orderPlaceLabel(details.order)}</span>
              </div>
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">الدفع</span>
                <span>{orderStatusLabel(details.order)}</span>
              </div>
              {details.order.noteAr && (
                <div className="order-details__meta-row">
                  <span className="order-details__meta-label">ملاحظة</span>
                  <span>{details.order.noteAr}</span>
                </div>
              )}
            </div>

            <table className="data-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {details.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.nameAr}
                      {item.sizeLabelAr && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                          {item.sizeLabelAr}
                        </div>
                      )}
                      {item.noteAr && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                          {item.noteAr}
                        </div>
                      )}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{item.unitPrice.toFixed(2)} {currency}</td>
                    <td>{item.lineTotal.toFixed(2)} {currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="order-details__totals">
              <div className="order-details__total-row">
                <span>الإجمالي</span>
                <strong>{details.order.total.toFixed(2)} {currency}</strong>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void reprint(details.order)}
              >
                طباعة الإيصال
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setDetails(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
