import { isAppOffline as readAppOffline } from '@renderer/features/sync/sync-store'

export function isAppOffline(): boolean {
  return readAppOffline()
}

export async function cacheDocs<T extends { id: string }>(
  collectionName: string,
  docs: T[]
): Promise<void> {
  if (!window.electronAPI?.cacheDocuments) return
  await window.electronAPI.cacheDocuments(
    collectionName,
    docs.map((doc) => ({ id: doc.id, data: doc }))
  )
}

export async function getCachedDocs<T>(collectionName: string): Promise<T[]> {
  if (!window.electronAPI?.getCachedDocuments) return []
  return (await window.electronAPI.getCachedDocuments(collectionName)) as T[]
}

export async function getCachedDoc<T>(
  collectionName: string,
  documentId: string
): Promise<T | null> {
  if (!window.electronAPI?.getCachedDocument) return null
  return (await window.electronAPI.getCachedDocument(collectionName, documentId)) as T | null
}

export function isOfflineError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? ''
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    isAppOffline()
  ) || code.includes('unavailable') || code.includes('network') || message.includes('offline')
}
