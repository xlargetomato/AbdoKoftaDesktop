/**
 * SQLite cache helpers — thin wrappers used by all service files.
 *
 * These now talk directly to the primary SQLite database.
 * Firebase is never consulted here.
 */
import { dbDelete, dbGet, dbGetAll, dbSave } from '@renderer/lib/db/sqlite-db'

// ---------------------------------------------------------------------------
// Offline flag — always false now that SQLite is primary
// ---------------------------------------------------------------------------

/** Always returns false — SQLite is always available */
export function isAppOffline(): boolean {
  return false
}

/** Always returns false — SQLite never errors for network reasons */
export function isOfflineError(_err: unknown): boolean {
  return false
}

// ---------------------------------------------------------------------------
// Document helpers
// ---------------------------------------------------------------------------

export async function cacheDocs<T extends { id: string }>(
  collectionName: string,
  docs: T[]
): Promise<void> {
  await dbSave(collectionName, docs)
}

export async function getCachedDocs<T>(collectionName: string): Promise<T[]> {
  return dbGetAll<T>(collectionName)
}

export async function getCachedDoc<T>(
  collectionName: string,
  documentId: string
): Promise<T | null> {
  return dbGet<T>(collectionName, documentId)
}

export async function deleteCachedDoc(
  collectionName: string,
  documentId: string
): Promise<void> {
  await dbDelete(collectionName, documentId)
}

// ---------------------------------------------------------------------------
// Merge helpers (kept for API compatibility — local always wins)
// ---------------------------------------------------------------------------

export function mergeLocalFirst<T extends { id: string }>(
  localDocs: T[],
  _remoteDocs: T[]
): T[] {
  return localDocs
}

export async function mergeAndCacheLocalFirst<T extends { id: string }>(
  collectionName: string,
  _remoteDocs: T[]
): Promise<T[]> {
  return getCachedDocs<T>(collectionName)
}

export async function mergeDocAndCacheLocalFirst<T extends { id: string }>(
  collectionName: string,
  _remoteDoc: T | null,
  documentId: string
): Promise<T | null> {
  return getCachedDoc<T>(collectionName, documentId)
}
