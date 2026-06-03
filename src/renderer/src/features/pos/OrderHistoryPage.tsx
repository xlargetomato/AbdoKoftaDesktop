import { useEffect, useState } from 'react'
import type { Order } from '@shared/types'
import { listOrders, getOrderItems } from '@renderer/features/orders/order-service'
import { getSettings } from '@renderer/features/orders/order-service'
import { printReceipt } from '@renderer/features/receipt/receipt-builder'

export function OrderHistoryPage(): React.ReactElement {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void listOrders(100).then((o) => {
      setOrders(o.filter((x) => x.status === 'completed'))
      setLoading(false)
    })
  }, [])

  async function reprint(order: Order): Promise<void> {
    const [items, settings] = await Promise.all([
      getOrderItems(order.id),
      getSettings()
    ])
    await printReceipt(order, items, settings)
  }

  if (loading) return <p>جاري التحميل...</p>

  return (
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
              <td>#{o.orderNumber}</td>
              <td>
                {new Date(o.completedAt ?? o.createdAt).toLocaleString('ar-EG')}
              </td>
              <td>{o.cashierName}</td>
              <td>{o.total.toFixed(2)}</td>
              <td>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => void reprint(o)}
                >
                  طباعة
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
