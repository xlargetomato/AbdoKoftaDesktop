import { getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'
import type { Supplier, SupplierTransaction, SupplierTransactionType } from '@shared/types'
import { collections, doc } from '@renderer/lib/firebase'
import { generateId } from '@renderer/lib/utils/id'
import { omitUndefined } from '@renderer/lib/utils/firestore-data'
import { mapDoc } from '@renderer/lib/utils/firestore-mapper'
import { trackWrite } from '../sync/sync-store'
import { COLLECTIONS } from '@shared/constants/collections'
import {
  cacheDocs,
  getCachedDocs,
  isAppOffline,
  mergeAndCacheLocalFirst
} from '@renderer/lib/offline/sqlite-cache'

export async function listSuppliers(activeOnly = false): Promise<Supplier[]> {
  let suppliers: Supplier[]
  if (isAppOffline()) {
    suppliers = (await getCachedDocs<Supplier>(COLLECTIONS.suppliers)).sort((a, b) =>
      a.nameAr.localeCompare(b.nameAr, 'ar')
    )
  } else {
    try {
      const snap = await getDocs(query(collections.suppliers(), orderBy('nameAr')))
      const remoteSuppliers = snap.docs.map((d) => mapDoc<Supplier>(d))
      suppliers = await mergeAndCacheLocalFirst(COLLECTIONS.suppliers, remoteSuppliers)
      suppliers = suppliers.sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'))
    } catch (e) {
      suppliers = await getCachedDocs<Supplier>(COLLECTIONS.suppliers)
      if (!suppliers.length) throw e
      suppliers = suppliers.sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'))
    }
  }
  return activeOnly ? suppliers.filter((s) => s.active) : suppliers
}

export async function createSupplier(data: {
  nameAr: string
  phone?: string
  noteAr?: string
}): Promise<Supplier> {
  const now = Date.now()
  const supplier: Supplier = {
    id: generateId(),
    nameAr: data.nameAr,
    phone: data.phone,
    noteAr: data.noteAr,
    active: true,
    createdAt: now,
    updatedAt: now
  }
  if (isAppOffline()) {
    await cacheDocs(COLLECTIONS.suppliers, [supplier])
    return supplier
  }
  await trackWrite(() =>
    setDoc(
      doc(collections.suppliers(), supplier.id),
      omitUndefined(supplier as unknown as Record<string, unknown>)
    )
  )
  await cacheDocs(COLLECTIONS.suppliers, [supplier])
  return supplier
}

export async function updateSupplier(
  id: string,
  patch: Partial<Pick<Supplier, 'nameAr' | 'phone' | 'noteAr' | 'active'>>
): Promise<void> {
  if (isAppOffline()) {
    const suppliers = await getCachedDocs<Supplier>(COLLECTIONS.suppliers)
    const cached = suppliers.find((supplier) => supplier.id === id)
    if (cached) await cacheDocs(COLLECTIONS.suppliers, [{ ...cached, ...patch, updatedAt: Date.now() }])
    return
  }
  await updateDoc(doc(collections.suppliers(), id), {
    ...omitUndefined(patch as Record<string, unknown>),
    updatedAt: Date.now()
  })
}

export async function recordSupplierTransaction(params: {
  supplierId: string
  type: SupplierTransactionType
  amount: number
  noteAr?: string
  shiftId?: string
  createdBy: string
}): Promise<SupplierTransaction> {
  const tx: SupplierTransaction = {
    id: generateId(),
    supplierId: params.supplierId,
    type: params.type,
    amount: params.amount,
    noteAr: params.noteAr,
    shiftId: params.shiftId,
    createdBy: params.createdBy,
    createdAt: Date.now()
  }
  if (isAppOffline()) {
    await cacheDocs(COLLECTIONS.supplierTransactions, [tx])
    return tx
  }
  await trackWrite(() =>
    setDoc(
      doc(collections.supplierTransactions(), tx.id),
      omitUndefined(tx as unknown as Record<string, unknown>)
    )
  )
  await cacheDocs(COLLECTIONS.supplierTransactions, [tx])
  return tx
}

export async function listSupplierTransactions(
  supplierId?: string
): Promise<SupplierTransaction[]> {
  if (isAppOffline()) {
    let transactions = await getCachedDocs<SupplierTransaction>(COLLECTIONS.supplierTransactions)
    if (supplierId) transactions = transactions.filter((tx) => tx.supplierId === supplierId)
    return transactions.sort((a, b) => b.createdAt - a.createdAt)
  }
  try {
    const base = query(collections.supplierTransactions(), orderBy('createdAt', 'desc'))
    const q = supplierId ? query(base, where('supplierId', '==', supplierId)) : base
    const snap = await getDocs(q)
    const remoteTransactions = snap.docs.map((d) => mapDoc<SupplierTransaction>(d))
    let transactions = await mergeAndCacheLocalFirst(COLLECTIONS.supplierTransactions, remoteTransactions)
    if (supplierId) transactions = transactions.filter((tx) => tx.supplierId === supplierId)
    return transactions.sort((a, b) => b.createdAt - a.createdAt)
  } catch (e) {
    let transactions = await getCachedDocs<SupplierTransaction>(COLLECTIONS.supplierTransactions)
    if (supplierId) transactions = transactions.filter((tx) => tx.supplierId === supplierId)
    if (transactions.length) return transactions.sort((a, b) => b.createdAt - a.createdAt)
    throw e
  }
}

export async function getSupplierBalance(supplierId: string): Promise<number> {
  const txs = await listSupplierTransactions(supplierId)
  return txs.reduce((sum, tx) => {
    if (tx.type === 'payment' || tx.type === 'debt_decrease' || tx.type === 'settlement') {
      return sum - tx.amount
    }
    return sum + tx.amount
  }, 0)
}
