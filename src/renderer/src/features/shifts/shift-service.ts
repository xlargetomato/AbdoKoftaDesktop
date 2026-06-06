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
import { COLLECTIONS } from '@shared/constants/collections'
import { cacheDocs, getCachedDocs, isAppOffline } from '@renderer/lib/offline/sqlite-cache'

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

async function patchCachedShifts(
  shiftIds: string[],
  patch: Partial<Shift>
): Promise<void> {
  const cached = await getCachedDocs<Shift>(COLLECTIONS.shifts)
  const updates = cached
    .filter((shift) => shiftIds.includes(shift.id))
    .map((shift) => ({ ...shift, ...patch, updatedAt: Date.now() }))
  if (updates.length) await cacheDocs(COLLECTIONS.shifts, updates)
}

export async function listShifts(includeArchived = false): Promise<Shift[]> {
  let shifts: Shift[]
  if (isAppOffline()) {
    shifts = (await getCachedDocs<Shift>(COLLECTIONS.shifts)).sort((a, b) => b.openedAt - a.openedAt)
  } else {
    try {
      const snap = await getDocs(query(collections.shifts(), orderBy('openedAt', 'desc')))
      shifts = snap.docs.map((d) => mapDoc<Shift>(d))
      await cacheDocs(COLLECTIONS.shifts, shifts)
    } catch (e) {
      shifts = await getCachedDocs<Shift>(COLLECTIONS.shifts)
      if (!shifts.length) throw e
      shifts = shifts.sort((a, b) => b.openedAt - a.openedAt)
    }
  }
  return includeArchived ? shifts : shifts.filter((s) => !s.archived)
}

export async function getOpenShiftForCashier(cashierId: string): Promise<Shift | null> {
  if (isAppOffline()) {
    const shifts = await getCachedDocs<Shift>(COLLECTIONS.shifts)
    return shifts.find((s) => s.cashierId === cashierId && s.status === 'open') ?? null
  }
  try {
    const snap = await getDocs(
      query(
        collections.shifts(),
        where('cashierId', '==', cashierId),
        where('status', '==', 'open')
      )
    )
    const first = snap.docs[0]
    if (!first) return null
    const shift = mapDoc<Shift>(first)
    await cacheDocs(COLLECTIONS.shifts, [shift])
    return shift
  } catch {
    const shifts = await getCachedDocs<Shift>(COLLECTIONS.shifts)
    return shifts.find((s) => s.cashierId === cashierId && s.status === 'open') ?? null
  }
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
  if (isAppOffline()) {
    await cacheDocs(COLLECTIONS.shifts, [shift])
    return shift
  }
  await trackWrite(() =>
    setDoc(
      doc(collections.shifts(), shift.id),
      omitUndefined(shift as unknown as Record<string, unknown>)
    )
  )
  await cacheDocs(COLLECTIONS.shifts, [shift])
  return shift
}

export async function closeShift(shiftId: string, closedBy: string): Promise<void> {
  const now = Date.now()
  if (isAppOffline()) {
    await patchCachedShifts([shiftId], {
      status: 'closed',
      closedAt: now,
      closedBy,
      updatedAt: now
    })
    return
  }
  await updateDoc(doc(collections.shifts(), shiftId), {
    status: 'closed',
    closedAt: now,
    closedBy,
    updatedAt: now
  })
  await patchCachedShifts([shiftId], {
    status: 'closed',
    closedAt: now,
    closedBy,
    updatedAt: now
  })
}

export async function archiveShifts(shiftIds: string[]): Promise<void> {
  const now = Date.now()
  if (isAppOffline()) {
    await patchCachedShifts(shiftIds, { archived: true, updatedAt: now })
    return
  }
  await Promise.all(
    shiftIds.map((id) =>
      updateDoc(doc(collections.shifts(), id), {
        archived: true,
        updatedAt: now
      })
    )
  )
  await patchCachedShifts(shiftIds, { archived: true, updatedAt: now })
}

export async function unarchiveShifts(shiftIds: string[]): Promise<void> {
  const now = Date.now()
  if (isAppOffline()) {
    await patchCachedShifts(shiftIds, { archived: false, updatedAt: now })
    return
  }
  await Promise.all(
    shiftIds.map((id) =>
      updateDoc(doc(collections.shifts(), id), {
        archived: false,
        updatedAt: now
      })
    )
  )
  await patchCachedShifts(shiftIds, { archived: false, updatedAt: now })
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
