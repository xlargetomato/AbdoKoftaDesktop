import { getDocs, orderBy, query, setDoc, where } from 'firebase/firestore'
import type { CashDrawerTransaction, CashDrawerTransactionType } from '@shared/types'
import { collections, doc } from '@renderer/lib/firebase'
import { generateId } from '@renderer/lib/utils/id'
import { omitUndefined } from '@renderer/lib/utils/firestore-data'
import { mapDoc } from '@renderer/lib/utils/firestore-mapper'
import { trackWrite } from '../sync/sync-store'

export async function recordCashDrawerTransaction(params: {
  type: CashDrawerTransactionType
  amount: number
  shiftId?: string
  orderId?: string
  supplierId?: string
  noteAr?: string
  createdBy: string
}): Promise<CashDrawerTransaction> {
  const tx: CashDrawerTransaction = {
    id: generateId(),
    type: params.type,
    amount: params.amount,
    shiftId: params.shiftId,
    orderId: params.orderId,
    supplierId: params.supplierId,
    noteAr: params.noteAr,
    createdBy: params.createdBy,
    createdAt: Date.now()
  }
  await trackWrite(() =>
    setDoc(
      doc(collections.cashDrawerTransactions(), tx.id),
      omitUndefined(tx as unknown as Record<string, unknown>)
    )
  )
  return tx
}

export async function listCashDrawerTransactions(
  shiftId?: string
): Promise<CashDrawerTransaction[]> {
  const base = query(collections.cashDrawerTransactions(), orderBy('createdAt', 'desc'))
  const q = shiftId ? query(base, where('shiftId', '==', shiftId)) : base
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapDoc<CashDrawerTransaction>(d))
}
