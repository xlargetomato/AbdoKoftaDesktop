import { listOrders, getOrderItems } from '../orders/order-service'

export interface DailySalesReport {
  dateKey: string
  orderCount: number
  totalSales: number
  avgOrder: number
}

export interface TopItem {
  nameAr: string
  quantity: number
  revenue: number
}

export interface CashierStat {
  cashierName: string
  orderCount: number
  totalSales: number
}

export interface ReportData {
  daily: DailySalesReport[]
  topItems: TopItem[]
  cashiers: CashierStat[]
  summary: {
    totalOrders: number
    totalRevenue: number
    avgOrderValue: number
    todayOrders: number
    todayRevenue: number
    weekRevenue: number
    bestDay: { dateKey: string; totalSales: number } | null
  }
}

function dateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export async function getFullReport(): Promise<ReportData> {
  const orders = await listOrders(1000)
  const completed = orders.filter((o) => o.status === 'completed')

  const today = dateKey(Date.now())
  const weekAgo = Date.now() - 7 * 86400000

  // ── Daily breakdown ───────────────────────────────────────────────────
  const byDay = new Map<string, DailySalesReport>()
  for (const o of completed) {
    const key = dateKey(o.completedAt ?? o.createdAt)
    const existing = byDay.get(key) ?? { dateKey: key, orderCount: 0, totalSales: 0, avgOrder: 0 }
    existing.orderCount += 1
    existing.totalSales += o.total
    byDay.set(key, existing)
  }
  const daily = Array.from(byDay.values())
    .map((r) => ({ ...r, avgOrder: r.orderCount > 0 ? r.totalSales / r.orderCount : 0 }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))

  // ── Cashier breakdown ─────────────────────────────────────────────────
  const byCashier = new Map<string, CashierStat>()
  for (const o of completed) {
    const existing = byCashier.get(o.cashierId) ?? {
      cashierName: o.cashierName,
      orderCount: 0,
      totalSales: 0
    }
    existing.orderCount += 1
    existing.totalSales += o.total
    byCashier.set(o.cashierId, existing)
  }
  const cashiers = Array.from(byCashier.values())
    .sort((a, b) => b.totalSales - a.totalSales)

  // ── Top items (fetch order items for recent 100 orders) ───────────────
  const recentCompleted = completed.slice(0, 100)
  const itemMap = new Map<string, TopItem>()
  await Promise.all(
    recentCompleted.map(async (o) => {
      const items = await getOrderItems(o.id)
      for (const item of items) {
        const existing = itemMap.get(item.menuItemId) ?? {
          nameAr: item.nameAr,
          quantity: 0,
          revenue: 0
        }
        existing.quantity += item.quantity
        existing.revenue += item.lineTotal
        itemMap.set(item.menuItemId, existing)
      }
    })
  )
  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)

  // ── Summary stats ─────────────────────────────────────────────────────
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0)
  const todayOrders = completed.filter((o) => dateKey(o.completedAt ?? o.createdAt) === today).length
  const todayRevenue = completed
    .filter((o) => dateKey(o.completedAt ?? o.createdAt) === today)
    .reduce((s, o) => s + o.total, 0)
  const weekRevenue = completed
    .filter((o) => (o.completedAt ?? o.createdAt) >= weekAgo)
    .reduce((s, o) => s + o.total, 0)
  const bestDay = daily.length > 0
    ? daily.reduce((best, r) => (r.totalSales > best.totalSales ? r : best), daily[0])
    : null

  return {
    daily,
    topItems,
    cashiers,
    summary: {
      totalOrders: completed.length,
      totalRevenue,
      avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      todayOrders,
      todayRevenue,
      weekRevenue,
      bestDay
    }
  }
}

// Keep old function for backward compat
export async function getSalesReport(): Promise<DailySalesReport[]> {
  const data = await getFullReport()
  return data.daily
}

export async function getSummaryStats(): Promise<{
  todayOrders: number
  todayRevenue: number
  weekRevenue: number
}> {
  const data = await getFullReport()
  return {
    todayOrders: data.summary.todayOrders,
    todayRevenue: data.summary.todayRevenue,
    weekRevenue: data.summary.weekRevenue
  }
}
