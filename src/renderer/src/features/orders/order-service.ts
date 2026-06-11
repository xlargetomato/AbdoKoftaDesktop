/**
 * Order service — SQLite primary database.
 * All order lifecycle operations read/write SQLite directly.
 * Firebase receives changes automatically via the outbox.
 */
import type {
  CashDrawerTransaction,
  DiningTable,
  InventoryTransaction,
  MenuItem,
  Order,
  OrderItem,
  OrderType,
  Payment
} from '@shared/types'
import {
  recipeDeductionLines,
  mergeDeductionLines
} from '@shared/services/inventory-ledger'
import {
  orderSubtotal,
  orderTotal,
  lineTotal
} from '@shared/services/order-calculator'
import { COLLECTIONS } from '@shared/constants/collections'
import { SETTINGS_DOC_ID } from '@shared/schema/firestore-schema'
import { RESTAURANT_NAME_AR } from '@shared/constants/branding'
import type { AppSettings } from '@shared/types'
import { cacheDocs, getCachedDoc, getCachedDocs } from '@renderer/lib/offline/sqlite-cache'
import { generateId } from '@renderer/lib/utils/id'
import { getRecipe } from '../menu/menu-service'
import { ensureOpenShift } from '../shifts/shift-service'
import { nextLocalShiftOrderReference } from '@renderer/lib/offline/order-number'

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  const defaults: AppSettings = {
    id: SETTINGS_DOC_ID,
    restaurantNameAr: RESTAURANT_NAME_AR,
    currencySymbol: 'ج.م',
    pinEnabled: false,
    autoLockMinutes: 5,
    nextOrderNumber: 1,
    updatedAt: Date.now()
  }
  const cached = await getCachedDoc<AppSettings>(COLLECTIONS.settings, SETTINGS_DOC_ID)
  return cached ?? defaults
}

export async function updateSettings(
  patch: Partial<
    Pick<
      AppSettings,
      | 'restaurantNameAr'
      | 'currencySymbol'
      | 'receiptFooterAr'
      | 'phoneNumber'
      | 'primaryColor'
      | 'pinEnabled'
      | 'autoLockMinutes'
    >
  >
): Promise<void> {
  const current = await getSettings()
  await cacheDocs(COLLECTIONS.settings, [{ ...current, ...patch, updatedAt: Date.now() }])
}

// ---------------------------------------------------------------------------
// Cart types
// ---------------------------------------------------------------------------

export interface CartLine {
  menuItemId: string
  nameAr: string
  unitPrice: number
  quantity: number
  sizeLabelAr?: string
  attachmentForMenuItemId?: string
  unitLabel?: string
  weightGrams?: number
  noteAr?: string
}

// ---------------------------------------------------------------------------
// Complete order
// ---------------------------------------------------------------------------

export async function completeOrder(params: {
  cashierId: string
  cashierName: string
  cashierCode?: string
  lines: CartLine[]
  orderNoteAr?: string
  orderType?: OrderType
  table?: Pick<DiningTable, 'id' | 'nameAr' | 'categoryAr'>
  paymentMethod?: 'cash' | 'card'
}): Promise<Order> {
  const subtotal = orderSubtotal(params.lines)
  const total = orderTotal(subtotal)
  const orderType = params.orderType ?? 'takeaway'

  if (orderType === 'takeaway' && !params.paymentMethod) {
    throw new Error('Payment method is required for takeaway orders')
  }
  if (orderType === 'dine_in' && !params.table) {
    throw new Error('Table is required for dine-in orders')
  }

  const shift = await ensureOpenShift({
    cashierId: params.cashierId,
    cashierName: params.cashierName,
    cashierCode: params.cashierCode
  })

  const existingOrders = (await getCachedDocs<Order>(COLLECTIONS.orders)).filter(
    (o) => o.shiftId === shift.id
  )
  const maxShiftSequence = existingOrders.reduce(
    (max, o) =>
      o.orderNumber > 0 && o.orderNumber <= 999999 ? Math.max(max, o.orderNumber) : max,
    0
  )
  const { orderNumber, orderCode } = nextLocalShiftOrderReference(
    shift.id,
    params.cashierCode,
    maxShiftSequence
  )

  const now = Date.now()
  const orderId = generateId()
  const isPaid = orderType === 'takeaway'

  const order: Order = {
    id: orderId,
    orderNumber,
    orderCode,
    status: isPaid ? 'completed' : 'draft',
    orderType,
    paymentStatus: isPaid ? 'paid' : 'unpaid',
    tableId: params.table?.id,
    tableNameAr: params.table?.nameAr,
    tableCategoryAr: params.table?.categoryAr,
    shiftId: shift.id,
    cashierId: params.cashierId,
    cashierName: params.cashierName,
    cashierCode: params.cashierCode,
    subtotal,
    total,
    noteAr: params.orderNoteAr,
    createdAt: now,
    updatedAt: now,
    completedAt: isPaid ? now : undefined,
    paidAt: isPaid ? now : undefined
  }

  const orderItems: OrderItem[] = params.lines.map((line) => ({
    id: generateId(),
    orderId,
    menuItemId: line.menuItemId,
    nameAr: line.nameAr,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    sizeLabelAr: line.sizeLabelAr,
    attachmentForMenuItemId: line.attachmentForMenuItemId,
    unitLabel: line.unitLabel,
    weightGrams: line.weightGrams,
    lineTotal: lineTotal(line.unitPrice, line.quantity),
    noteAr: line.noteAr
  }))

  const payment: Payment | null = isPaid
    ? {
        id: generateId(),
        orderId,
        amount: total,
        method: params.paymentMethod!,
        createdAt: now
      }
    : null

  const inventoryTransactions = await buildInventoryTransactions(
    orderId,
    orderItems,
    params.cashierId,
    now,
    shift.id
  )

  const drawerTransaction: CashDrawerTransaction | null = isPaid
    ? {
        id: generateId(),
        type: 'sale',
        amount: total,
        shiftId: shift.id,
        orderId,
        createdBy: params.cashierId,
        createdAt: now
      }
    : null

  // Write everything to SQLite atomically (sequential awaits)
  await cacheDocs(COLLECTIONS.orders, [order])
  await cacheDocs(COLLECTIONS.orderItems, orderItems)
  if (payment) await cacheDocs(COLLECTIONS.payments, [payment])
  if (inventoryTransactions.length) {
    await cacheDocs(COLLECTIONS.inventoryTransactions, inventoryTransactions)
  }
  if (drawerTransaction) {
    await cacheDocs(COLLECTIONS.cashDrawerTransactions, [drawerTransaction])
  }

  return order
}

async function buildInventoryTransactions(
  orderId: string,
  items: OrderItem[],
  createdBy: string,
  createdAt: number,
  shiftId?: string
): Promise<InventoryTransaction[]> {
  const allLines: Array<{ ingredientId: string; quantity: number; unit: string }> = []

  for (const item of items) {
    const menuItem = await getCachedDoc<MenuItem>(COLLECTIONS.menuItems, item.menuItemId)
    if (!menuItem?.recipeId) continue
    const recipe = await getRecipe(menuItem.recipeId)
    if (!recipe) continue
    allLines.push(...recipeDeductionLines(recipe, item.quantity))
  }

  return mergeDeductionLines(allLines).map((line) => ({
    id: generateId(),
    ingredientId: line.ingredientId,
    type: 'sale' as const,
    quantity: line.quantity,
    unit: line.unit,
    referenceType: 'order' as const,
    referenceId: orderId,
    shiftId,
    noteAr: 'خصم تلقائي من الطلب',
    createdBy,
    createdAt
  }))
}

// ---------------------------------------------------------------------------
// Mark paid
// ---------------------------------------------------------------------------

export async function markOrderPaid(params: {
  orderId: string
  cashierId: string
  paymentMethod: 'cash' | 'card'
}): Promise<Order | null> {
  const order = await getCachedDoc<Order>(COLLECTIONS.orders, params.orderId)
  if (!order || order.status === 'cancelled') return null

  const now = Date.now()
  const paidOrder: Order = {
    ...order,
    status: 'completed',
    paymentStatus: 'paid',
    paidAt: now,
    completedAt: now,
    updatedAt: now
  }
  const payment: Payment = {
    id: generateId(),
    orderId: order.id,
    amount: order.total,
    method: params.paymentMethod,
    createdAt: now
  }
  const drawerTransaction: CashDrawerTransaction = {
    id: generateId(),
    type: 'sale',
    amount: order.total,
    shiftId: order.shiftId,
    orderId: order.id,
    createdBy: params.cashierId,
    createdAt: now
  }

  await cacheDocs(COLLECTIONS.orders, [paidOrder])
  await cacheDocs(COLLECTIONS.payments, [payment])
  await cacheDocs(COLLECTIONS.cashDrawerTransactions, [drawerTransaction])
  return paidOrder
}

// ---------------------------------------------------------------------------
// Cancel order
// ---------------------------------------------------------------------------

export async function cancelOrder(params: {
  orderId: string
  cancelledBy: string
  reasonAr?: string
  inventoryMode: 'return' | 'waste'
}): Promise<void> {
  const order = await getCachedDoc<Order>(COLLECTIONS.orders, params.orderId)
  if (!order) return

  const now = Date.now()
  const cancelledOrder: Order = {
    ...order,
    status: 'cancelled',
    cancelledAt: now,
    cancelledBy: params.cancelledBy,
    cancelReasonAr: params.reasonAr,
    cancelInventoryMode: params.inventoryMode,
    updatedAt: now
  }

  const shouldReverseCash = order.status === 'completed' && order.paymentStatus !== 'unpaid'
  const drawerTransaction: CashDrawerTransaction | null = shouldReverseCash
    ? {
        id: generateId(),
        type: 'sale',
        amount: -order.total,
        shiftId: order.shiftId,
        orderId: order.id,
        noteAr: params.reasonAr || 'Cancelled order',
        createdBy: params.cancelledBy,
        createdAt: now
      }
    : null

  await cacheDocs(COLLECTIONS.orders, [cancelledOrder])
  if (drawerTransaction) await cacheDocs(COLLECTIONS.cashDrawerTransactions, [drawerTransaction])

  if (params.inventoryMode === 'return') {
    const reversals = await buildInventoryReversals(order.id, params.cancelledBy, now)
    if (reversals.length) await cacheDocs(COLLECTIONS.inventoryTransactions, reversals)
  }
}

async function buildInventoryReversals(
  orderId: string,
  createdBy: string,
  createdAt: number
): Promise<InventoryTransaction[]> {
  const allTxs = await getCachedDocs<InventoryTransaction>(COLLECTIONS.inventoryTransactions)
  const saleTxs = allTxs.filter((tx) => tx.referenceId === orderId && tx.type === 'sale')
  return saleTxs.map((tx) => ({
    id: generateId(),
    ingredientId: tx.ingredientId,
    type: 'sale_reversal' as const,
    quantity: -tx.quantity,
    unit: tx.unit,
    referenceType: 'order' as const,
    referenceId: orderId,
    shiftId: tx.shiftId,
    noteAr: 'عكس خصم مخزون لطلب ملغي',
    createdBy,
    createdAt
  }))
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listOrders(limit = 50): Promise<Order[]> {
  const orders = await getCachedDocs<Order>(COLLECTIONS.orders)
  return orders.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}

export async function listUnpaidDineInOrders(): Promise<Order[]> {
  const orders = await listOrders(1000)
  return orders.filter(
    (o) =>
      o.status !== 'cancelled' &&
      (o.orderType ?? 'takeaway') === 'dine_in' &&
      (o.paymentStatus === 'unpaid' || o.status === 'draft')
  )
}

export async function listUnpaidDeferredOrders(): Promise<Order[]> {
  const orders = await listOrders(1000)
  return orders.filter(
    (o) =>
      o.status !== 'cancelled' &&
      ((o.orderType ?? 'takeaway') === 'dine_in' || o.orderType === 'delivery') &&
      (o.paymentStatus === 'unpaid' || o.status === 'draft')
  )
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const items = await getCachedDocs<OrderItem>(COLLECTIONS.orderItems)
  return items.filter((item) => item.orderId === orderId)
}

export async function archiveOrders(orderIds: string[]): Promise<void> {
  const orders = await getCachedDocs<Order>(COLLECTIONS.orders)
  const updates = orders
    .filter((o) => orderIds.includes(o.id))
    .map((o) => ({ ...o, archived: true, updatedAt: Date.now() }))
  if (updates.length) await cacheDocs(COLLECTIONS.orders, updates)
}

export async function unarchiveOrders(orderIds: string[]): Promise<void> {
  const orders = await getCachedDocs<Order>(COLLECTIONS.orders)
  const updates = orders
    .filter((o) => orderIds.includes(o.id))
    .map((o) => ({ ...o, archived: false, updatedAt: Date.now() }))
  if (updates.length) await cacheDocs(COLLECTIONS.orders, updates)
}
