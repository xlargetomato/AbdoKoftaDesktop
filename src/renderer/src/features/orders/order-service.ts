/**
 * Order service — SQLite primary database.
 * Supports: discounts, VAT/tax, delivery info, split payment, order editing.
 */
import type {
  CashDrawerTransaction,
  DiningTable,
  DiscountType,
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
  lineTotal,
  computeDiscount,
  computeTax
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
    taxRate: 0,
    defaultDeliveryFee: 0,
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
      | 'taxRate'
      | 'defaultDeliveryFee'
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
  paymentMethod?: 'cash' | 'card' | 'split'
  cashPaid?: number    // for split payment
  cardPaid?: number    // for split payment
  discountType?: DiscountType
  discountValue?: number
  deliveryFee?: number
  customerName?: string
  customerPhone?: string
  customerAddress?: string
}): Promise<Order> {
  const settings = await getSettings()
  const subtotal = orderSubtotal(params.lines)
  const orderType = params.orderType ?? 'takeaway'
  const deliveryFee = params.deliveryFee ?? (orderType === 'delivery' ? (settings.defaultDeliveryFee ?? 0) : 0)

  const discountAmount = computeDiscount(subtotal, params.discountType, params.discountValue)
  const afterDiscount = subtotal - discountAmount
  const taxRate = settings.taxRate ?? 0
  const taxAmount = computeTax(afterDiscount, taxRate)
  const total = orderTotal(subtotal, discountAmount, taxAmount, deliveryFee)

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
    (max, o) => o.orderNumber > 0 && o.orderNumber <= 999999 ? Math.max(max, o.orderNumber) : max,
    0
  )
  const { orderNumber, orderCode } = nextLocalShiftOrderReference(
    shift.id, params.cashierCode, maxShiftSequence
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
    paymentStatus: isPaid ? (params.paymentMethod === 'split' ? 'split' : 'paid') : 'unpaid',
    tableId: params.table?.id,
    tableNameAr: params.table?.nameAr,
    tableCategoryAr: params.table?.categoryAr,
    shiftId: shift.id,
    cashierId: params.cashierId,
    cashierName: params.cashierName,
    cashierCode: params.cashierCode,
    subtotal,
    discountType: params.discountType,
    discountValue: params.discountValue,
    discountAmount: discountAmount > 0 ? discountAmount : undefined,
    taxRate: taxRate > 0 ? taxRate : undefined,
    taxAmount: taxAmount > 0 ? taxAmount : undefined,
    deliveryFee: deliveryFee > 0 ? deliveryFee : undefined,
    total,
    noteAr: params.orderNoteAr,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerAddress: params.customerAddress,
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

  // Build payments (supports split)
  const payments: Payment[] = []
  if (isPaid && params.paymentMethod) {
    if (params.paymentMethod === 'split') {
      const cashAmt = Math.round((params.cashPaid ?? 0) * 100) / 100
      const cardAmt = Math.round((params.cardPaid ?? 0) * 100) / 100
      if (cashAmt > 0) payments.push({ id: generateId(), orderId, amount: cashAmt, method: 'cash', createdAt: now })
      if (cardAmt > 0) payments.push({ id: generateId(), orderId, amount: cardAmt, method: 'card', createdAt: now })
    } else {
      payments.push({ id: generateId(), orderId, amount: total, method: params.paymentMethod as 'cash' | 'card', createdAt: now })
    }
  }

  const inventoryTransactions = await buildInventoryTransactions(
    orderId, orderItems, params.cashierId, now, shift.id
  )

  // Cash drawer: one entry per payment method
  const drawerTransactions: CashDrawerTransaction[] = []
  if (isPaid) {
    for (const p of payments) {
      drawerTransactions.push({
        id: generateId(),
        type: 'sale',
        amount: p.amount,
        shiftId: shift.id,
        orderId,
        createdBy: params.cashierId,
        createdAt: now
      })
    }
  }

  await cacheDocs(COLLECTIONS.orders, [order])
  await cacheDocs(COLLECTIONS.orderItems, orderItems)
  if (payments.length) await cacheDocs(COLLECTIONS.payments, payments)
  if (inventoryTransactions.length) await cacheDocs(COLLECTIONS.inventoryTransactions, inventoryTransactions)
  if (drawerTransactions.length) await cacheDocs(COLLECTIONS.cashDrawerTransactions, drawerTransactions)

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
// Mark paid (supports split payment)
// ---------------------------------------------------------------------------

export async function markOrderPaid(params: {
  orderId: string
  cashierId: string
  paymentMethod: 'cash' | 'card' | 'split'
  cashPaid?: number
  cardPaid?: number
}): Promise<Order | null> {
  const order = await getCachedDoc<Order>(COLLECTIONS.orders, params.orderId)
  if (!order || order.status === 'cancelled') return null

  const now = Date.now()
  const paidOrder: Order = {
    ...order,
    status: 'completed',
    paymentStatus: params.paymentMethod === 'split' ? 'split' : 'paid',
    paidAt: now,
    completedAt: now,
    updatedAt: now
  }

  const payments: Payment[] = []
  if (params.paymentMethod === 'split') {
    const cashAmt = Math.round((params.cashPaid ?? 0) * 100) / 100
    const cardAmt = Math.round((params.cardPaid ?? 0) * 100) / 100
    if (cashAmt > 0) payments.push({ id: generateId(), orderId: order.id, amount: cashAmt, method: 'cash', createdAt: now })
    if (cardAmt > 0) payments.push({ id: generateId(), orderId: order.id, amount: cardAmt, method: 'card', createdAt: now })
  } else {
    payments.push({ id: generateId(), orderId: order.id, amount: order.total, method: params.paymentMethod, createdAt: now })
  }

  const drawerTransactions: CashDrawerTransaction[] = payments.map((p) => ({
    id: generateId(),
    type: 'sale',
    amount: p.amount,
    shiftId: order.shiftId,
    orderId: order.id,
    createdBy: params.cashierId,
    createdAt: now
  }))

  await cacheDocs(COLLECTIONS.orders, [paidOrder])
  await cacheDocs(COLLECTIONS.payments, payments)
  await cacheDocs(COLLECTIONS.cashDrawerTransactions, drawerTransactions)
  return paidOrder
}

// ---------------------------------------------------------------------------
// Edit open dine-in / delivery order
// ---------------------------------------------------------------------------

export async function editOrderItems(params: {
  orderId: string
  cashierId: string
  lines: CartLine[]
  orderNoteAr?: string
}): Promise<Order> {
  const order = await getCachedDoc<Order>(COLLECTIONS.orders, params.orderId)
  if (!order) throw new Error('الطلب غير موجود')
  if (order.status === 'cancelled') throw new Error('الطلب ملغي')
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'split') {
    throw new Error('لا يمكن تعديل طلب مدفوع')
  }

  const settings = await getSettings()
  const subtotal = orderSubtotal(params.lines)
  const discountAmount = computeDiscount(subtotal, order.discountType, order.discountValue)
  const afterDiscount = subtotal - discountAmount
  const taxRate = settings.taxRate ?? 0
  const taxAmount = computeTax(afterDiscount, taxRate)
  const deliveryFee = order.deliveryFee ?? 0
  const total = orderTotal(subtotal, discountAmount, taxAmount, deliveryFee)

  const now = Date.now()
  const updatedOrder: Order = {
    ...order,
    subtotal,
    discountAmount: discountAmount > 0 ? discountAmount : undefined,
    taxAmount: taxAmount > 0 ? taxAmount : undefined,
    total,
    noteAr: params.orderNoteAr ?? order.noteAr,
    updatedAt: now
  }

  // Replace order items
  const allItems = await getCachedDocs<OrderItem>(COLLECTIONS.orderItems)
  const oldItems = allItems.filter((i) => i.orderId === params.orderId)
  const newItems: OrderItem[] = params.lines.map((line) => ({
    id: generateId(),
    orderId: params.orderId,
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

  // Reverse old inventory deductions, apply new ones
  const oldInventory = (await getCachedDocs<InventoryTransaction>(COLLECTIONS.inventoryTransactions))
    .filter((tx) => tx.referenceId === params.orderId && tx.type === 'sale')
  const reversals: InventoryTransaction[] = oldInventory.map((tx) => ({
    ...tx,
    id: generateId(),
    type: 'sale_reversal' as const,
    quantity: -tx.quantity,
    noteAr: 'عكس تعديل طلب',
    createdAt: now
  }))
  const newInventory = await buildInventoryTransactions(
    params.orderId, newItems, params.cashierId, now, order.shiftId
  )

  // Remove old items (mark them as replaced by writing updated list without old ones)
  const remainingItems = allItems.filter((i) => i.orderId !== params.orderId)
  await cacheDocs(COLLECTIONS.orders, [updatedOrder])
  await cacheDocs(COLLECTIONS.orderItems, [...remainingItems, ...newItems])
  if (reversals.length) await cacheDocs(COLLECTIONS.inventoryTransactions, reversals)
  if (newInventory.length) await cacheDocs(COLLECTIONS.inventoryTransactions, newInventory)

  return updatedOrder
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

  const shouldReverseCash = order.status === 'completed' &&
    order.paymentStatus !== 'unpaid' && order.paymentStatus !== undefined
  const drawerTransaction: CashDrawerTransaction | null = shouldReverseCash
    ? {
        id: generateId(),
        type: 'sale',
        amount: -order.total,
        shiftId: order.shiftId,
        orderId: order.id,
        noteAr: params.reasonAr || 'إلغاء طلب',
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
    (o) => o.status !== 'cancelled' &&
      (o.orderType ?? 'takeaway') === 'dine_in' &&
      (o.paymentStatus === 'unpaid' || o.status === 'draft')
  )
}

export async function listUnpaidDeferredOrders(): Promise<Order[]> {
  const orders = await listOrders(1000)
  return orders.filter(
    (o) => o.status !== 'cancelled' &&
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
