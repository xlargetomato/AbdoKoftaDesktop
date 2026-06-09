import { deleteDoc, getDocs, orderBy, query, setDoc, updateDoc } from 'firebase/firestore'
import type { DiningTable } from '@shared/types'
import { COLLECTIONS } from '@shared/constants/collections'
import { collections, doc } from '@renderer/lib/firebase'
import { generateId } from '@renderer/lib/utils/id'
import { omitUndefined } from '@renderer/lib/utils/firestore-data'
import { mapDoc } from '@renderer/lib/utils/firestore-mapper'
import {
  cacheDocs,
  getCachedDocs,
  isAppOffline,
  mergeAndCacheLocalFirst
} from '@renderer/lib/offline/sqlite-cache'
import { trackWrite } from '../sync/sync-store'

export async function listDiningTables(includeInactive = false): Promise<DiningTable[]> {
  let tables: DiningTable[]
  if (isAppOffline()) {
    tables = await getCachedDocs<DiningTable>(COLLECTIONS.diningTables)
  } else {
    try {
      const snap = await getDocs(query(collections.diningTables(), orderBy('sortOrder', 'asc')))
      const remoteTables = snap.docs.map((d) => mapDoc<DiningTable>(d))
      tables = await mergeAndCacheLocalFirst(COLLECTIONS.diningTables, remoteTables)
    } catch (e) {
      tables = await getCachedDocs<DiningTable>(COLLECTIONS.diningTables)
      if (!tables.length) throw e
    }
  }

  return tables
    .filter((table) => includeInactive || table.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameAr.localeCompare(b.nameAr))
}

export async function saveDiningTable(
  input: Partial<DiningTable> & Pick<DiningTable, 'nameAr'>
): Promise<DiningTable> {
  const now = Date.now()
  const table: DiningTable = {
    id: input.id ?? generateId(),
    nameAr: input.nameAr.trim(),
    categoryAr: input.categoryAr?.trim() || undefined,
    sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: now
  }

  if (isAppOffline()) {
    await cacheDocs(COLLECTIONS.diningTables, [table])
    return table
  }

  await trackWrite(() =>
    setDoc(
      doc(collections.diningTables(), table.id),
      omitUndefined(table as unknown as Record<string, unknown>),
      { merge: true }
    )
  )
  await cacheDocs(COLLECTIONS.diningTables, [table])
  return table
}

export async function setDiningTableActive(tableId: string, active: boolean): Promise<void> {
  const now = Date.now()
  if (isAppOffline()) {
    const tables = await getCachedDocs<DiningTable>(COLLECTIONS.diningTables)
    const table = tables.find((t) => t.id === tableId)
    if (table) await cacheDocs(COLLECTIONS.diningTables, [{ ...table, active, updatedAt: now }])
    return
  }

  await trackWrite(() =>
    updateDoc(doc(collections.diningTables(), tableId), { active, updatedAt: now })
  )
  const tables = await getCachedDocs<DiningTable>(COLLECTIONS.diningTables)
  const table = tables.find((t) => t.id === tableId)
  if (table) await cacheDocs(COLLECTIONS.diningTables, [{ ...table, active, updatedAt: now }])
}

export async function deleteDiningTable(tableId: string): Promise<void> {
  if (isAppOffline()) {
    await setDiningTableActive(tableId, false)
    return
  }
  await trackWrite(() => deleteDoc(doc(collections.diningTables(), tableId)))
}
