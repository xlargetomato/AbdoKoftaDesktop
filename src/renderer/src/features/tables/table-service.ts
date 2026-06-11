/**
 * Dining tables service — SQLite primary database.
 */
import type { DiningTable } from '@shared/types'
import { COLLECTIONS } from '@shared/constants/collections'
import { cacheDocs, getCachedDocs } from '@renderer/lib/offline/sqlite-cache'
import { dbDelete } from '@renderer/lib/db/sqlite-db'
import { generateId } from '@renderer/lib/utils/id'

export async function listDiningTables(includeInactive = false): Promise<DiningTable[]> {
  let tables = await getCachedDocs<DiningTable>(COLLECTIONS.diningTables)
  if (!includeInactive) tables = tables.filter((t) => t.active)
  return tables.sort((a, b) => a.sortOrder - b.sortOrder || a.nameAr.localeCompare(b.nameAr))
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
  await cacheDocs(COLLECTIONS.diningTables, [table])
  return table
}

export async function setDiningTableActive(tableId: string, active: boolean): Promise<void> {
  const tables = await getCachedDocs<DiningTable>(COLLECTIONS.diningTables)
  const table = tables.find((t) => t.id === tableId)
  if (!table) return
  await cacheDocs(COLLECTIONS.diningTables, [{ ...table, active, updatedAt: Date.now() }])
}

export async function deleteDiningTable(tableId: string): Promise<void> {
  await dbDelete(COLLECTIONS.diningTables, tableId)
}
