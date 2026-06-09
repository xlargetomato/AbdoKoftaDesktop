import {
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
  writeBatch,
  getDoc,
  deleteField
} from 'firebase/firestore'
import type { CashDrawerTransaction, DiningTable, InventoryTransaction, MenuItem, Order, OrderItem, OrderType, Payment } from '@shared/types'
import {
  recipeDeductionLines,
  mergeDeductionLines
} from '@shared/services/inventory-ledger'
import {
  orderSubtotal,
  orderTotal,
  lineTotal
} from '@shared/services/order-calculator'
import { collections, doc, getDb } from '@renderer/lib/firebase'
import { trackWrite } from '../sync/sync-store'
import { mapDoc } from '@renderer/lib/utils/firestore-mapper'
import { generateId } from '@renderer/lib/utils/id'
import { omitUndefined } from '@renderer/lib/utils/firestore-data'
import { getRecipe } from '../menu/menu-service'
import { SETTINGS_DOC_ID } from '@shared/schema/firestore-schema'
import { RESTAURANT_NAME_AR } from '@shared/constants/branding'
import type { AppSettings } from '@shared/types'
import { nextLocalShiftOrderReference } from '@renderer/lib/offline/order-number'
import { ensureOpenShift } from '../shifts/shift-service'
import { COLLECTIONS } from '@shared/constants/collections'
import {
  cacheDocs,
  getCachedDoc,
  getCachedDocs,
  isAppOffline
} from '@renderer/lib/offline/sqlite-cache'

export interface CartLine {
  menuItemId: string
  nameAr: string
  unitPrice: number
  quantity: number
  unitLabel?: string
  weightGrams?: number
  noteAr?: string
}

interface CompleteOrderParams {
  cashierId: string
  cashierName: string
  cashierCode?: string
  lines: CartLine[]
  orderNoteAr?: string
  orderType?: OrderType
  table?: Pick<DiningTable, 'id' | 'nameAr' | 'categoryAr'>
  paymentMethod?: 'cash' | 'card'
}

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
  if (isAppOffline()) {
    return (await getCachedDoc<AppSettings>(COLLECTIONS.settings, SETTINGS_DOC_ID)) ?? defaults
  }
  try {
    const snap = await getDoc(doc(collections.settings(), SETTINGS_DOC_ID))
    if (!snap.exists()) return defaults
    const settings = mapDoc<AppSettings>(snap as never)
    await cacheDocs(COLLECTIONS.settings, [settings])
    return settings
  } catch {
    return (await getCachedDoc<AppSettings>(COLLECTIONS.settings, SETTINGS_DOC_ID)) ?? defaults
  }
}

export async function updateSettings(
  patch: Partial<Pick<AppSettings, 'restaurantNameAr' | 'currencySymbol' | 'receiptFooterAr' | 'phoneNumber' | 'primaryColor' | 'pinEnabled' | 'autoLockMinutes'>>
): Promise<void> {
  if (isAppOffline()) {
    const current = await getSettings()
    await cacheDocs(COLLECTIONS.settings, [{
      ...current,
      ...patch,
      updatedAt: Date.now()
    }])
    return
  }
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    data[key] = value === undefined ? deleteField() : value
  }
  await updateDoc(
    doc(collections.settings(), SETTINGS_DOC_ID),
    { ...data, updatedAt: Date.now() }
  )
}

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
  if (isAppOffline()) return _completeOrder(params, true)
  return trackWrite(() => _completeOrder(params))
}

async function _completeOrder(params: CompleteOrderParams, offlineOnly = false): Promise<Order> {
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
  const { orderNumber, orderCode } = await nextShiftOrderReference(shift.id, params.cashierCode)
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

  const batch = offlineOnly ? null : writeBatch(getDb())
  batch?.set(
    doc(collections.orders(), orderId),
    omitUndefined(order as unknown as Record<string, unknown>)
  )

  const orderItems: OrderItem[] = params.lines.map((line) => {
    const itemId = generateId()
    const oi: OrderItem = {
      id: itemId,
      orderId,
      menuItemId: line.menuItemId,
      nameAr: line.nameAr,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      unitLabel: line.unitLabel,
      weightGrams: line.weightGrams,
      lineTotal: lineTotal(line.unitPrice, line.quantity),
      noteAr: line.noteAr
    }
    batch?.set(
      doc(collections.orderItems(), itemId),
      omitUndefined(oi as unknown as Record<string, unknown>)
    )
    return oi
  })

  const payment: Payment | null = isPaid
    ? {
        id: generateId(),
        orderId,
        amount: total,
        method: params.paymentMethod!,
        createdAt: now
      }
    : null
  if (payment) batch?.set(doc(collections.payments(), payment.id), payment)

  const inventoryTransactions = await inventoryTransactionsForOrder(
    orderId,
    orderItems,
    params.cashierId,
    now,
    shift.id
  )
  for (const tx of inventoryTransactions) {
    batch?.set(
      doc(collections.inventoryTransactions(), tx.id),
      omitUndefined(tx as unknown as Record<string, unknown>)
    )
  }

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
  if (drawerTransaction) {
    batch?.set(
      doc(collections.cashDrawerTransactions(), drawerTransaction.id),
      omitUndefined(drawerTransaction as unknown as Record<string, unknown>)
    )
  }

  await batch?.commit()
  const cacheWrites = [
    cacheDocs(COLLECTIONS.orders, [order]),
    cacheDocs(COLLECTIONS.orderItems, orderItems),
    cacheDocs(COLLECTIONS.inventoryTransactions, inventoryTransactions)
  ]
  if (drawerTransaction) {
    cacheWrites.push(cacheDocs(COLLECTIONS.cashDrawerTransactions, [drawerTransaction]))
  }
  await Promise.all(cacheWrites)
  return order
}

async function nextShiftOrderReference(
  shiftId: string,
  cashierCode?: string
): Promise<{ orderNumber: number; orderCode: string }> {
  let existingOrders: Order[] = []
  if (isAppOffline()) {
    existingOrders = (await getCachedDocs<Order>(COLLECTIONS.orders)).filter(
      (order) => order.shiftId === shiftId
    )
  } else {
    try {
      const snap = await getDocs(query(collections.orders(), where('shiftId', '==', shiftId)))
      existingOrders = snap.docs.map((d) => mapDoc<Order>(d))
    } catch {
      existingOrders = (await getCachedDocs<Order>(COLLECTIONS.orders)).filter(
        (order) => order.shiftId === shiftId
      )
    }
  }

  const maxShiftSequence = existingOrders.reduce((max, order) => {
    return order.orderNumber > 0 && order.orderNumber <= 999999
      ? Math.max(max, order.orderNumber)
      : max
  }, 0)

  return nextLocalShiftOrderReference(shiftId, cashierCode, maxShiftSequence)
}

async function inventoryTransactionsForOrder(
  orderId: string,
  items: OrderItem[],
  createdBy: string,
  createdAt: number,
  shiftId?: string
): Promise<InventoryTransaction[]> {
  const allLines: Array<{
    ingredientId: string
    quantity: number
    unit: string
  }> = []

  for (const item of items) {
    let menuItem: Pick<MenuItem, 'recipeId'> | null = null
    if (isAppOffline()) {
      menuItem = await getCachedDoc<MenuItem>(COLLECTIONS.menuItems, item.menuItemId)
    } else {
      try {
        const menuSnap = await getDoc(
          doc(collections.menuItems(), item.menuItemId)
        )
        if (menuSnap.exists()) menuItem = menuSnap.data() as Pick<MenuItem, 'recipeId'>
      } catch {
        menuItem = await getCachedDoc<MenuItem>(COLLECTIONS.menuItems, item.menuItemId)
      }
    }
    if (!menuItem?.recipeId) continue
    const recipe = await getRecipe(menuItem.recipeId)
    if (!recipe) continue
    allLines.push(...recipeDeductionLines(recipe, item.quantity))
  }

  const merged = mergeDeductionLines(allLines)
  return merged.map((line) => ({
    id: generateId(),
    ingredientId: line.ingredientId,
    type: 'sale',
    quantity: line.quantity,
    unit: line.unit,
    referenceType: 'order',
    referenceId: orderId,
    shiftId,
    noteAr: 'خصم تلقائي من الطلب',
    createdBy,
    createdAt
  }))
}

export async function markOrderPaid(params: {
  orderId: string
  cashierId: string
  paymentMethod: 'cash' | 'card'
}): Promise<Order | null> {
  if (isAppOffline()) {
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
    await Promise.all([
      cacheDocs(COLLECTIONS.orders, [paidOrder]),
      cacheDocs(COLLECTIONS.payments, [payment]),
      cacheDocs(COLLECTIONS.cashDrawerTransactions, [drawerTransaction])
    ])
    return paidOrder
  }

  return trackWrite(async () => {
    const orderSnap = await getDoc(doc(collections.orders(), params.orderId))
    if (!orderSnap.exists()) return null
    const order = mapDoc<Order>(orderSnap)
    if (order.status === 'cancelled') return null
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
    const batch = writeBatch(getDb())
    batch.update(doc(collections.orders(), order.id), {
      status: 'completed',
      paymentStatus: 'paid',
      paidAt: now,
      completedAt: now,
      updatedAt: now
    })
    batch.set(doc(collections.payments(), payment.id), payment)
    batch.set(
      doc(collections.cashDrawerTransactions(), drawerTransaction.id),
      omitUndefined(drawerTransaction as unknown as Record<string, unknown>)
    )
    await batch.commit()
    await Promise.all([
      cacheDocs(COLLECTIONS.orders, [paidOrder]),
      cacheDocs(COLLECTIONS.payments, [payment]),
      cacheDocs(COLLECTIONS.cashDrawerTransactions, [drawerTransaction])
    ])
    return paidOrder
  })
}

export async function cancelOrder(params: {
  orderId: string
  cancelledBy: string
  reasonAr?: string
  inventoryMode: 'return' | 'waste'
}): Promise<void> {
  if (isAppOffline()) {
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
    const updates: Promise<void>[] = [cacheDocs(COLLECTIONS.orders, [cancelledOrder])]
    if (drawerTransaction) {
      updates.push(cacheDocs(COLLECTIONS.cashDrawerTransactions, [drawerTransaction]))
    }
    if (params.inventoryMode === 'return') {
      updates.push(
        inventoryReversalsForOrder(order.id, params.cancelledBy, now).then((reversals) =>
          cacheDocs(COLLECTIONS.inventoryTransactions, reversals)
        )
      )
    }
    await Promise.all(updates)
    return
  }

  await trackWrite(async () => {
    const orderSnap = await getDoc(doc(collections.orders(), params.orderId))
    if (!orderSnap.exists()) return
    const order = mapDoc<Order>(orderSnap)
    const now = Date.now()
    const batch = writeBatch(getDb())

    batch.update(doc(collections.orders(), params.orderId), {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: params.cancelledBy,
      cancelReasonAr: params.reasonAr,
      cancelInventoryMode: params.inventoryMode,
      updatedAt: now
    })

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
    if (drawerTransaction) {
      batch.set(
        doc(collections.cashDrawerTransactions(), drawerTransaction.id),
        omitUndefined(drawerTransaction as unknown as Record<string, unknown>)
      )
    }

    if (params.inventoryMode === 'return') {
      const reversals = await inventoryReversalsForOrder(order.id, params.cancelledBy, now)
      for (const reversal of reversals) {
        batch.set(
          doc(collections.inventoryTransactions(), reversal.id),
          omitUndefined(reversal as unknown as Record<string, unknown>)
        )
      }
    }

    await batch.commit()
    const cancelledOrder: Order = {
      ...order,
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: params.cancelledBy,
      cancelReasonAr: params.reasonAr,
      cancelInventoryMode: params.inventoryMode,
      updatedAt: now
    }
    const cacheWrites: Promise<void>[] = [cacheDocs(COLLECTIONS.orders, [cancelledOrder])]
    if (drawerTransaction) {
      cacheWrites.push(cacheDocs(COLLECTIONS.cashDrawerTransactions, [drawerTransaction]))
    }
    await Promise.all(cacheWrites)
  })
}
async function inventoryReversalsForOrder(
  orderId: string,
  createdBy: string,
  createdAt: number
): Promise<InventoryTransaction[]> {
  const saleTransactions = isAppOffline()
    ? (await getCachedDocs<InventoryTransaction>(COLLECTIONS.inventoryTransactions))
        .filter((tx) => tx.referenceId === orderId && tx.type === 'sale')
    : (await getDocs(query(collections.inventoryTransactions(), where('referenceId', '==', orderId)))).docs
        .map((d) => mapDoc<InventoryTransaction>(d))
        .filter((tx) => tx.type === 'sale')

  return saleTransactions.map((tx) => ({
    id: generateId(),
    ingredientId: tx.ingredientId,
    type: 'sale_reversal',
    quantity: -tx.quantity,
    unit: tx.unit,
    referenceType: 'order',
    referenceId: orderId,
    shiftId: tx.shiftId,
    noteAr: 'عكس خصم مخزون لطلب ملغي',
    createdBy,
    createdAt
  }))
}

export async function listOrders(limit = 50): Promise<Order[]> {
  if (isAppOffline()) {
    const orders = await getCachedDocs<Order>(COLLECTIONS.orders)
    return orders.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
  }
  try {
    const snap = await getDocs(
      query(collections.orders(), orderBy('createdAt', 'desc'))
    )
    const orders = snap.docs.map((d) => mapDoc<Order>(d))
    await cacheDocs(COLLECTIONS.orders, orders)
    return orders.slice(0, limit)
  } catch (e) {
    const orders = await getCachedDocs<Order>(COLLECTIONS.orders)
    if (orders.length) return orders.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
    throw e
  }
}

export async function listUnpaidDineInOrders(): Promise<Order[]> {
  const orders = await listOrders(1000)
  return orders.filter((order) =>
    order.status !== 'cancelled' &&
    (order.orderType ?? 'takeaway') === 'dine_in' &&
    (order.paymentStatus === 'unpaid' || order.status === 'draft')
  )
}

export async function archiveOrders(orderIds: string[]): Promise<void> {
  if (isAppOffline()) {
    const orders = await getCachedDocs<Order>(COLLECTIONS.orders)
    await cacheDocs(
      COLLECTIONS.orders,
      orders
        .filter((order) => orderIds.includes(order.id))
        .map((order) => ({ ...order, archived: true, updatedAt: Date.now() }))
    )
    return
  }
  await Promise.all(
    orderIds.map((id) =>
      updateDoc(doc(collections.orders(), id), { archived: true, updatedAt: Date.now() })
    )
  )
}

export async function unarchiveOrders(orderIds: string[]): Promise<void> {
  if (isAppOffline()) {
    const orders = await getCachedDocs<Order>(COLLECTIONS.orders)
    await cacheDocs(
      COLLECTIONS.orders,
      orders
        .filter((order) => orderIds.includes(order.id))
        .map((order) => ({ ...order, archived: false, updatedAt: Date.now() }))
    )
    return
  }
  await Promise.all(
    orderIds.map((id) =>
      updateDoc(doc(collections.orders(), id), { archived: false, updatedAt: Date.now() })
    )
  )
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  if (isAppOffline()) {
    return (await getCachedDocs<OrderItem>(COLLECTIONS.orderItems)).filter(
      (item) => item.orderId === orderId
    )
  }
  try {
    const q = query(
      collections.orderItems(),
      where('orderId', '==', orderId)
    )
    const snap = await getDocs(q)
    const items = snap.docs.map((d) => mapDoc<OrderItem>(d))
    await cacheDocs(COLLECTIONS.orderItems, items)
    return items
  } catch (e) {
    const items = (await getCachedDocs<OrderItem>(COLLECTIONS.orderItems)).filter(
      (item) => item.orderId === orderId
    )
    if (items.length) return items
    throw e
  }
}
