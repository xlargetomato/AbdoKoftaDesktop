import type { Order, OrderItem, AppSettings } from '@shared/types'

export function buildReceiptHtml(
  order: Order,
  items: OrderItem[],
  settings: AppSettings
): string {
  const rows = items
    .map(
      (i) => `
    <tr>
      <td>${escapeHtml(i.nameAr)}</td>
      <td>${i.quantity}</td>
      <td>${formatMoney(i.unitPrice, settings)}</td>
      <td>${formatMoney(i.lineTotal, settings)}</td>
    </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'Cairo', Tahoma, sans-serif; font-size: 12px; margin: 8px; direction: rtl; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px; text-align: right; border-bottom: 1px dashed #ccc; }
    .totals { margin-top: 12px; }
    .totals div { display: flex; justify-content: space-between; margin: 4px 0; }
    .footer { text-align: center; margin-top: 16px; font-size: 10px; color: #666; }
  </style>
</head>
<body>
  <h1>${escapeHtml(settings.restaurantNameAr)}</h1>
  <p>طلب رقم: ${order.orderNumber}</p>
  <p>${new Date(order.completedAt ?? order.createdAt).toLocaleString('ar-EG')}</p>
  <p>الكاشير: ${escapeHtml(order.cashierName)}</p>
  <table>
    <thead>
      <tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><strong>الإجمالي</strong><strong>${formatMoney(order.total, settings)}</strong></div>
  </div>
  ${settings.receiptFooterAr ? `<p class="footer">${escapeHtml(settings.receiptFooterAr)}</p>` : ''}
</body>
</html>`
}

function formatMoney(amount: number, settings: AppSettings): string {
  return `${amount.toFixed(2)} ${settings.currencySymbol}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function printReceipt(
  order: Order,
  items: OrderItem[],
  settings: AppSettings
): Promise<boolean> {
  const html = buildReceiptHtml(order, items, settings)
  const api = (window as Window & { electronAPI?: { printReceipt: (h: string) => Promise<boolean> } })
    .electronAPI
  if (api?.printReceipt) {
    return api.printReceipt(html)
  }
  const w = window.open('', '_blank', 'width=400,height=600')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  w.print()
  return true
}
