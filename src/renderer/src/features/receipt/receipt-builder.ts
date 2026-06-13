import type { Order, OrderItem, AppSettings } from '@shared/types'
import { orderReference } from '@shared/services/order-reference'

export function buildReceiptHtml(
  order: Order,
  items: OrderItem[],
  settings: AppSettings
): string {
  const cur = settings.currencySymbol

  const rows = items
    .map((item) => `
    <tr>
      <td>${escapeHtml(item.nameAr)}${item.sizeLabelAr ? `<br/><small>${escapeHtml(item.sizeLabelAr)}</small>` : ''}${item.noteAr ? `<br/><small style="color:#888">${escapeHtml(item.noteAr)}</small>` : ''}</td>
      <td style="text-align:center">${item.unitLabel ? item.quantity.toFixed(3) : item.quantity}</td>
      <td>${fm(item.unitPrice, cur)}</td>
      <td>${fm(item.lineTotal, cur)}</td>
    </tr>`)
    .join('')

  // Build totals section
  const totalsRows: string[] = []
  totalsRows.push(`<div><span>المجموع الفرعي</span><span>${fm(order.subtotal, cur)}</span></div>`)

  if (order.discountAmount && order.discountAmount > 0) {
    const discLabel = order.discountType === 'percent'
      ? `خصم (${order.discountValue}%)`
      : 'خصم'
    totalsRows.push(`<div style="color:#c0392b"><span>${discLabel}</span><span>- ${fm(order.discountAmount, cur)}</span></div>`)
  }

  if (order.taxAmount && order.taxAmount > 0) {
    totalsRows.push(`<div><span>ضريبة القيمة المضافة (${order.taxRate}%)</span><span>${fm(order.taxAmount, cur)}</span></div>`)
  }

  if (order.deliveryFee && order.deliveryFee > 0) {
    totalsRows.push(`<div><span>رسوم التوصيل</span><span>${fm(order.deliveryFee, cur)}</span></div>`)
  }

  totalsRows.push(`<div class="grand-total"><strong>الإجمالي</strong><strong>${fm(order.total, cur)}</strong></div>`)

  // Payment method
  let paymentRow = ''
  if (order.paymentStatus === 'split') {
    paymentRow = `<div><span>الدفع</span><span>نقدي + بطاقة</span></div>`
  } else if (order.paymentStatus === 'paid') {
    paymentRow = `<div><span>الدفع</span><span>مدفوع</span></div>`
  }

  // Delivery info
  let deliveryInfo = ''
  if (order.orderType === 'delivery') {
    const parts = [
      order.customerName && `<p>العميل: ${escapeHtml(order.customerName)}</p>`,
      order.customerPhone && `<p>الهاتف: ${escapeHtml(order.customerPhone)}</p>`,
      order.customerAddress && `<p>العنوان: ${escapeHtml(order.customerAddress)}</p>`
    ].filter(Boolean)
    if (parts.length) {
      deliveryInfo = `<hr/>${parts.join('')}`
    }
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Cairo', Tahoma, sans-serif; font-size: 12px; margin: 8px; direction: rtl; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 2px; font-weight: 900; }
    .sub { text-align: center; font-size: 11px; color: #555; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { padding: 3px 4px; text-align: right; border-bottom: 1px dashed #ddd; font-size: 11px; }
    th { font-weight: 800; background: #f5f5f5; }
    small { color: #666; font-size: 10px; }
    .totals { margin: 8px 0; }
    .totals div { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; }
    .grand-total { border-top: 2px solid #000; margin-top: 4px; padding-top: 4px; font-size: 13px; }
    .footer { text-align: center; margin-top: 12px; font-size: 10px; color: #888; }
    hr { border: none; border-top: 1px dashed #ccc; margin: 6px 0; }
    .order-type { background: #000; color: #fff; text-align: center; padding: 3px; font-weight: 800; margin: 4px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(settings.restaurantNameAr)}</h1>
  ${settings.phoneNumber ? `<p class="sub">${escapeHtml(settings.phoneNumber)}</p>` : ''}
  <hr/>
  <div class="order-type">${escapeHtml(orderTypeLabel(order))}</div>
  <p style="margin:4px 0"><strong>طلب رقم:</strong> ${escapeHtml(orderReference(order))}</p>
  <p style="margin:2px 0;font-size:11px">${new Date(order.completedAt ?? order.createdAt).toLocaleString('ar-EG')}</p>
  <p style="margin:2px 0;font-size:11px">الكاشير: ${escapeHtml(order.cashierName)}</p>
  ${order.noteAr ? `<p style="margin:2px 0;font-size:11px;color:#555">ملاحظة: ${escapeHtml(order.noteAr)}</p>` : ''}
  ${deliveryInfo}
  <table>
    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    ${totalsRows.join('')}
    ${paymentRow}
  </div>
  ${settings.receiptFooterAr ? `<hr/><p class="footer">${escapeHtml(settings.receiptFooterAr)}</p>` : ''}
</body>
</html>`
}

function fm(amount: number, cur: string): string {
  return `${amount.toFixed(2)} ${cur}`
}

function orderTypeLabel(order: Order): string {
  if (order.orderType === 'dine_in') {
    return order.tableNameAr
      ? `صالة — ${order.tableNameAr}${order.tableCategoryAr ? ` / ${order.tableCategoryAr}` : ''}`
      : 'صالة'
  }
  if (order.orderType === 'delivery') return 'دليفري'
  return 'تيك أواي'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function printReceipt(
  order: Order,
  items: OrderItem[],
  settings: AppSettings
): Promise<boolean> {
  const html = buildReceiptHtml(order, items, settings)
  if (window.electronAPI?.printReceipt) {
    return window.electronAPI.printReceipt(html)
  }
  const receiptWindow = window.open('', '_blank', 'width=400,height=600')
  if (!receiptWindow) return false
  receiptWindow.document.write(html)
  receiptWindow.document.close()
  receiptWindow.print()
  return true
}
