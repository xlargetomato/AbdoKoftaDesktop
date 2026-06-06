import { useEffect, useState } from 'react'
import type { Order, OrderItem } from '@shared/types'
import { listOrders, getOrderItems, getSettings } from '@renderer/features/orders/order-service'
import { printReceipt } from '@renderer/features/receipt/receipt-builder'
import { orderReference } from '@shared/services/order-reference'

interface OrderDetails {
  order: Order
  items: OrderItem[]
}

export function OrderHistoryPage(): React.ReactElement {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<OrderDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    void listOrders(100).then((o) => {
      setOrders(o.filter((x) => x.status === 'completed'))
      setLoading(false)
    })
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

  if (loading) return <p className="app-loading">جاري التحميل...</p>

  const cur = 'ج.م'

  return (
    <>
      <div className="card">
        <h2 className="card__title">سجل الطلبات</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>التاريخ</th>
              <th>الكاشير</th>
              <th>الإجمالي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>#{orderReference(o)}</td>
                <td>{new Date(o.completedAt ?? o.createdAt).toLocaleString('ar-EG')}</td>
                <td>{o.cashierName}</td>
                <td>{o.total.toFixed(2)} {cur}</td>
                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => void openDetails(o)}
                      disabled={loadingDetails}
                    >
                      تفاصيل
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => void reprint(o)}
                    >
                      طباعة
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Order details modal ── */}
      {details && (
        <div className="modal-overlay" onClick={() => setDetails(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
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
                ✕
              </button>
            </div>

            {/* Meta */}
            <div className="order-details__meta">
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">التاريخ</span>
                <span>{new Date(details.order.completedAt ?? details.order.createdAt).toLocaleString('ar-EG')}</span>
              </div>
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">الكاشير</span>
                <span>{details.order.cashierName}</span>
              </div>
              {details.order.noteAr && (
                <div className="order-details__meta-row">
                  <span className="order-details__meta-label">ملاحظة</span>
                  <span>{details.order.noteAr}</span>
                </div>
              )}
            </div>

            {/* Items */}
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
                      {item.noteAr && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                          {item.noteAr}
                        </div>
                      )}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{item.unitPrice.toFixed(2)} {cur}</td>
                    <td>{item.lineTotal.toFixed(2)} {cur}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="order-details__totals">
              <div className="order-details__total-row">
                <span>الإجمالي</span>
                <strong>{details.order.total.toFixed(2)} {cur}</strong>
              </div>
            </div>

            {/* Actions */}
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
