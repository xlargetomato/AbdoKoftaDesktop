import {
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
  writeBatch,
  getDoc
} from 'firebase/firestore'
import type { InventoryTransaction, Order, OrderItem, Payment } from '@shared/types'
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
import { nextLocalOrderReference } from '@renderer/lib/offline/order-number'

export interface CartLine {
  menuItemId: string
  nameAr: string
  unitPrice: number
  quantity: number
  noteAr?: string
}

export async function getSettings(): Promise<AppSettings> {
  const snap = await getDoc(doc(collections.settings(), SETTINGS_DOC_ID))
  if (!snap.exists()) {
    const defaults: AppSettings = {
      id: SETTINGS_DOC_ID,
      restaurantNameAr: RESTAURANT_NAME_AR,
      currencySymbol: 'ج.م',
      pinEnabled: false,
      autoLockMinutes: 5,
      nextOrderNumber: 1,
      updatedAt: Date.now()
    }
    return defaults
  }
  return mapDoc<AppSettings>(snap as never)
}

export async function updateSettings(
  patch: Partial<Pick<AppSettings, 'restaurantNameAr' | 'currencySymbol' | 'receiptFooterAr' | 'phoneNumber' | 'primaryColor' | 'pinEnabled' | 'autoLockMinutes'>>
): Promise<void> {
  await updateDoc(
    doc(collections.settings(), SETTINGS_DOC_ID),
    { ...patch, updatedAt: Date.now() }
  )
}

export async function completeOrder(params: {
  cashierId: string
  cashierName: string
  lines: CartLine[]
  orderNoteAr?: string
  paymentMethod: 'cash' | 'card'
}): Promise<Order> {
  return trackWrite(() => _completeOrder(params))
}

async function _completeOrder(params: {
  cashierId: string
  cashierName: string
  lines: CartLine[]
  orderNoteAr?: string
  paymentMethod: 'cash' | 'card'
}): Promise<Order> {
  const subtotal = orderSubtotal(params.lines)
  const total = orderTotal(subtotal)
  const { orderNumber, orderCode } = nextLocalOrderReference()
  const now = Date.now()
  const orderId = generateId()

  const order: Order = {
    id: orderId,
    orderNumber,
    orderCode,
    status: 'completed',
    cashierId: params.cashierId,
    cashierName: params.cashierName,
    subtotal,
    total,
    noteAr: params.orderNoteAr,
    createdAt: now,
    updatedAt: now,
    completedAt: now
  }

  const batch = writeBatch(getDb())
  batch.set(
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
      lineTotal: lineTotal(line.unitPrice, line.quantity),
      noteAr: line.noteAr
    }
    batch.set(
      doc(collections.orderItems(), itemId),
      omitUndefined(oi as unknown as Record<string, unknown>)
    )
    return oi
  })

  const payment: Payment = {
    id: generateId(),
    orderId,
    amount: total,
    method: params.paymentMethod,
    createdAt: now
  }
  batch.set(doc(collections.payments(), payment.id), payment)

  const inventoryTransactions = await inventoryTransactionsForOrder(
    orderId,
    orderItems,
    params.cashierId,
    now
  )
  for (const tx of inventoryTransactions) {
    batch.set(
      doc(collections.inventoryTransactions(), tx.id),
      omitUndefined(tx as unknown as Record<string, unknown>)
    )
  }

  await batch.commit()

  return order
}

async function inventoryTransactionsForOrder(
  orderId: string,
  items: OrderItem[],
  createdBy: string,
  createdAt: number
): Promise<InventoryTransaction[]> {
  const allLines: Array<{
    ingredientId: string
    quantity: number
    unit: string
  }> = []

  for (const item of items) {
    const menuSnap = await getDoc(
      doc(collections.menuItems(), item.menuItemId)
    )
    if (!menuSnap.exists()) continue
    const menuItem = menuSnap.data() as { recipeId: string }
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
      noteAr: 'خصم تلقائي من الطلب',
      createdBy,
      createdAt
    }))
}

export async function listOrders(limit = 50): Promise<Order[]> {
  const snap = await getDocs(
    query(collections.orders(), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map((d) => mapDoc<Order>(d)).slice(0, limit)
}

export async function archiveOrders(orderIds: string[]): Promise<void> {
  await Promise.all(
    orderIds.map((id) =>
      updateDoc(doc(collections.orders(), id), { archived: true, updatedAt: Date.now() })
    )
  )
}

export async function unarchiveOrders(orderIds: string[]): Promise<void> {
  await Promise.all(
    orderIds.map((id) =>
      updateDoc(doc(collections.orders(), id), { archived: false, updatedAt: Date.now() })
    )
  )
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const q = query(
    collections.orderItems(),
    where('orderId', '==', orderId)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapDoc<OrderItem>(d))
}
