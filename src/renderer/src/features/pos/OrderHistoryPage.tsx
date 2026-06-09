import { useEffect, useState } from 'react'
import type { Order, OrderItem } from '@shared/types'
import { cancelOrder, listOrders, getOrderItems, getSettings, markOrderPaid } from '@renderer/features/orders/order-service'
import { printReceipt } from '@renderer/features/receipt/receipt-builder'
import { orderReference } from '@shared/services/order-reference'
import { useAuthStore } from '@renderer/features/auth/auth-store'

interface OrderDetails {
  order: Order
  items: OrderItem[]
}

export function OrderHistoryPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user)!
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<OrderDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [message, setMessage] = useState('')

  async function load(): Promise<void> {
    const o = await listOrders(100)
    setOrders(o.filter((x) => x.status === 'draft' || x.status === 'completed' || x.status === 'cancelled'))
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
      'Ù‡Ù„ ÙŠØ¹ØªØ¨Ø± Ù…Ø®Ø²ÙˆÙ† Ù‡Ø°Ø§ Ø§Ù„Ø·Ù„Ø¨ Ù‡Ø¯Ø±ØŸ\nOK = Ù‡Ø¯Ø± ÙˆÙ„Ø§ ÙŠØ±Ø¬Ø¹ Ù„Ù„Ù…Ø®Ø²ÙˆÙ†\nCancel = ÙŠØ±Ø¬Ø¹ Ù„Ù„Ù…Ø®Ø²ÙˆÙ†'
    )
    const reasonAr = window.prompt('Ø³Ø¨Ø¨ Ø§Ù„Ø¥Ù„ØºØ§Ø¡', '') ?? undefined
    await cancelOrder({
      orderId: order.id,
      cancelledBy: user.id,
      reasonAr,
      inventoryMode: wasted ? 'waste' : 'return'
    })
    setMessage('ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø·Ù„Ø¨')
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
    setMessage('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø¯ÙØ¹ Ø§Ù„Ø·Ù„Ø¨')
    await load()
    await printReceipt(paid, items, settings)
  }
  if (loading) return <p className="app-loading">Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</p>

  const cur = 'Ø¬.Ù…'

  return (
    <>
      <div className="card">
        <h2 className="card__title">Ø³Ø¬Ù„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª</h2>
        {message && <p className="form-message form-message--ok">{message}</p>}
        <table className="data-table">
          <thead>
            <tr>
              <th>Ø±Ù‚Ù… Ø§Ù„Ø·Ù„Ø¨</th>
              <th>Ø§Ù„Ø­Ø§Ù„Ø©</th>
              <th>Ø§Ù„ØªØ±Ø§Ø¨ÙŠØ²Ø©</th>
              <th>Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
              <th>Ø§Ù„ÙƒØ§Ø´ÙŠØ±</th>
              <th>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const unpaid = o.status === 'draft' || o.paymentStatus === 'unpaid'
              return (
                <tr key={o.id} className={unpaid ? 'order-row--unpaid' : ''}>
                  <td>#{orderReference(o)}</td>
                  <td>
                    <span className={`order-status-pill${unpaid ? ' order-status-pill--unpaid' : ''}`}>
                      {o.status === 'cancelled' ? 'Ù…Ù„ØºÙŠ' : unpaid ? 'ØºÙŠØ± Ù…Ø¯ÙÙˆØ¹' : 'Ù…Ø¯ÙÙˆØ¹'}
                    </span>
                  </td>
                  <td>{o.tableNameAr ? `${o.tableNameAr}${o.tableCategoryAr ? ` - ${o.tableCategoryAr}` : ''}` : 'ØªÙŠÙƒ Ø£ÙˆØ§ÙŠ'}</td>
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
                        ØªÙØ§ØµÙŠÙ„
                      </button>
                      {!unpaid && (
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => void reprint(o)}
                        >
                          Ø·Ø¨Ø§Ø¹Ø©
                        </button>
                      )}
                      {unpaid && o.status !== 'cancelled' && (
                        <>
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => void handleMarkPaid(o, 'cash')}>Ø¯ÙØ¹ Ù†Ù‚Ø¯ÙŠ</button>
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleMarkPaid(o, 'card')}>Ø¯ÙØ¹ Ø¨Ø·Ø§Ù‚Ø©</button>
                        </>
                      )}
                      {o.status !== 'cancelled' && (
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => void handleCancel(o)}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* â”€â”€ Order details modal â”€â”€ */}
      {details && (
        <div className="modal-overlay" onClick={() => setDetails(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="order-details__header">
              <h2 className="order-details__title">
                Ø·Ù„Ø¨ #{orderReference(details.order)}
              </h2>
              <button
                type="button"
                className="order-details__close"
                onClick={() => setDetails(null)}
                aria-label="Ø¥ØºÙ„Ø§Ù‚"
              >
                âœ•
              </button>
            </div>

            {/* Meta */}
            <div className="order-details__meta">
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">Ø§Ù„ØªØ§Ø±ÙŠØ®</span>
                <span>{new Date(details.order.completedAt ?? details.order.createdAt).toLocaleString('ar-EG')}</span>
              </div>
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">Ø§Ù„ÙƒØ§Ø´ÙŠØ±</span>
                <span>{details.order.cashierName}</span>
              </div>
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">Ø§Ù„Ù†ÙˆØ¹</span>
                <span>{details.order.tableNameAr ? `${details.order.tableNameAr}${details.order.tableCategoryAr ? ` - ${details.order.tableCategoryAr}` : ''}` : 'ØªÙŠÙƒ Ø£ÙˆØ§ÙŠ'}</span>
              </div>
              <div className="order-details__meta-row">
                <span className="order-details__meta-label">Ø§Ù„Ø¯ÙØ¹</span>
                <span>{details.order.status === 'draft' || details.order.paymentStatus === 'unpaid' ? 'ØºÙŠØ± Ù…Ø¯ÙÙˆØ¹' : details.order.status === 'cancelled' ? 'Ù…Ù„ØºÙŠ' : 'Ù…Ø¯ÙÙˆØ¹'}</span>
              </div>
              {details.order.noteAr && (
                <div className="order-details__meta-row">
                  <span className="order-details__meta-label">Ù…Ù„Ø§Ø­Ø¸Ø©</span>
                  <span>{details.order.noteAr}</span>
                </div>
              )}
            </div>

            {/* Items */}
            <table className="data-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Ø§Ù„ØµÙ†Ù</th>
                  <th>Ø§Ù„ÙƒÙ…ÙŠØ©</th>
                  <th>Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø©</th>
                  <th>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</th>
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
                <span>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</span>
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
                Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø¥ÙŠØµØ§Ù„
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setDetails(null)}
              >
                Ø¥ØºÙ„Ø§Ù‚
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
