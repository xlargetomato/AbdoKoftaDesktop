import { getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'
import type { CashDrawerTransaction, InventoryTransaction, Order, Shift } from '@shared/types'
import { collections, doc } from '@renderer/lib/firebase'
import { generateId } from '@renderer/lib/utils/id'
import { omitUndefined } from '@renderer/lib/utils/firestore-data'
import { mapDoc } from '@renderer/lib/utils/firestore-mapper'
import { listOrders } from '../orders/order-service'
import { listInventoryTransactions } from '../inventory/inventory-service'
import { listCashDrawerTransactions } from '../cash/cash-service'
import { trackWrite } from '../sync/sync-store'

export interface ShiftSummary {
  shift: Shift
  orders: Order[]
  completedOrders: Order[]
  cancelledOrders: Order[]
  revenue: number
  drawerTotal: number
  expenses: number
  suppliedInventory: InventoryTransaction[]
  usedInventory: InventoryTransaction[]
  cashTransactions: CashDrawerTransaction[]
}

export async function listShifts(includeArchived = false): Promise<Shift[]> {
  const snap = await getDocs(query(collections.shifts(), orderBy('openedAt', 'desc')))
  const shifts = snap.docs.map((d) => mapDoc<Shift>(d))
  return includeArchived ? shifts : shifts.filter((s) => !s.archived)
}

export async function getOpenShiftForCashier(cashierId: string): Promise<Shift | null> {
  const snap = await getDocs(
    query(
      collections.shifts(),
      where('cashierId', '==', cashierId),
      where('status', '==', 'open')
    )
  )
  const first = snap.docs[0]
  return first ? mapDoc<Shift>(first) : null
}

export async function ensureOpenShift(params: {
  cashierId: string
  cashierName: string
  cashierCode?: string
}): Promise<Shift> {
  const existing = await getOpenShiftForCashier(params.cashierId)
  if (existing) return existing

  const now = Date.now()
  const shift: Shift = {
    id: generateId(),
    cashierId: params.cashierId,
    cashierName: params.cashierName,
    cashierCode: params.cashierCode,
    status: 'open',
    archived: false,
    openedAt: now,
    createdAt: now,
    updatedAt: now
  }
  await trackWrite(() =>
    setDoc(
      doc(collections.shifts(), shift.id),
      omitUndefined(shift as unknown as Record<string, unknown>)
    )
  )
  return shift
}

export async function closeShift(shiftId: string, closedBy: string): Promise<void> {
  await updateDoc(doc(collections.shifts(), shiftId), {
    status: 'closed',
    closedAt: Date.now(),
    closedBy,
    updatedAt: Date.now()
  })
}

export async function archiveShifts(shiftIds: string[]): Promise<void> {
  await Promise.all(
    shiftIds.map((id) =>
      updateDoc(doc(collections.shifts(), id), {
        archived: true,
        updatedAt: Date.now()
      })
    )
  )
}

export async function unarchiveShifts(shiftIds: string[]): Promise<void> {
  await Promise.all(
    shiftIds.map((id) =>
      updateDoc(doc(collections.shifts(), id), {
        archived: false,
        updatedAt: Date.now()
      })
    )
  )
}

export async function getUnarchivedShiftCount(): Promise<number> {
  const shifts = await listShifts(false)
  return shifts.length
}

export async function getShiftSummary(shift: Shift): Promise<ShiftSummary> {
  const [allOrders, inventoryTransactions, cashTransactions] = await Promise.all([
    listOrders(2000),
    listInventoryTransactions(),
    listCashDrawerTransactions(shift.id)
  ])
  const orders = allOrders.filter((o) => o.shiftId === shift.id)
  const completedOrders = orders.filter((o) => o.status === 'completed')
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled')
  const suppliedInventory = inventoryTransactions.filter(
    (tx) => tx.shiftId === shift.id && tx.type === 'purchase'
  )
  const usedInventory = inventoryTransactions.filter(
    (tx) => tx.shiftId === shift.id && (tx.type === 'sale' || tx.type === 'waste')
  )
  const revenue = completedOrders.reduce((sum, o) => sum + o.total, 0)
  const expenses = cashTransactions
    .filter((tx) => tx.type !== 'sale' && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  const drawerTotal = cashTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  return {
    shift,
    orders,
    completedOrders,
    cancelledOrders,
    revenue,
    drawerTotal,
    expenses,
    suppliedInventory,
    usedInventory,
    cashTransactions
  }
}
