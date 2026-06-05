import { getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'
import type { Supplier, SupplierTransaction, SupplierTransactionType } from '@shared/types'
import { collections, doc } from '@renderer/lib/firebase'
import { generateId } from '@renderer/lib/utils/id'
import { omitUndefined } from '@renderer/lib/utils/firestore-data'
import { mapDoc } from '@renderer/lib/utils/firestore-mapper'
import { trackWrite } from '../sync/sync-store'

export async function listSuppliers(activeOnly = false): Promise<Supplier[]> {
  const snap = await getDocs(query(collections.suppliers(), orderBy('nameAr')))
  const suppliers = snap.docs.map((d) => mapDoc<Supplier>(d))
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
  await trackWrite(() =>
    setDoc(
      doc(collections.suppliers(), supplier.id),
      omitUndefined(supplier as unknown as Record<string, unknown>)
    )
  )
  return supplier
}

export async function updateSupplier(
  id: string,
  patch: Partial<Pick<Supplier, 'nameAr' | 'phone' | 'noteAr' | 'active'>>
): Promise<void> {
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
  await trackWrite(() =>
    setDoc(
      doc(collections.supplierTransactions(), tx.id),
      omitUndefined(tx as unknown as Record<string, unknown>)
    )
  )
  return tx
}

export async function listSupplierTransactions(
  supplierId?: string
): Promise<SupplierTransaction[]> {
  const base = query(collections.supplierTransactions(), orderBy('createdAt', 'desc'))
  const q = supplierId ? query(base, where('supplierId', '==', supplierId)) : base
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapDoc<SupplierTransaction>(d))
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
