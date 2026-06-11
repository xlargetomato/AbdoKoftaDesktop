/**
 * Background Firebase upload service.
 *
 * Reads the sync outbox from SQLite and uploads each entry to Firestore
 * using the Admin SDK via IPC. This is fire-and-forget — the app never
 * waits for Firebase before reading/writing data.
 */

import { useSyncStore } from './sync-store'

interface OutboxEntry {
  id: string
  entity_type: string
  entity_id: string
  operation: 'set' | 'delete'
  payload_json: string
  status: string
  attempts: number
}

let running = false

export async function uploadOutboxToFirebase(): Promise<{
  uploaded: number
  deleted: number
  failed: number
}> {
  if (running) return { uploaded: 0, deleted: 0, failed: 0 }
  running = true

  const result = { uploaded: 0, deleted: 0, failed: 0 }

  try {
    const store = useSyncStore.getState()

    // Reset any previously failed entries so they get retried
    await window.electronAPI.outboxResetFailed()

    const pending = (await window.electronAPI.outboxGetPending()) as OutboxEntry[]
    if (!pending.length) return result

    store.setSyncProgress(0, 'جاري الرفع إلى Firebase')

    const successIds: string[] = []
    const failIds: string[] = []

    for (const [index, entry] of pending.entries()) {
      const progress = Math.round(((index + 1) / pending.length) * 100)
      store.setSyncProgress(progress, 'جاري الرفع إلى Firebase')

      try {
        if (entry.operation === 'delete') {
          // For deletes we use a tombstone write with _deleted flag
          const deleteResult = await window.electronAPI.setAdminDocument(
            entry.entity_type,
            entry.entity_id,
            { id: entry.entity_id, _deleted: true, deletedAt: Date.now() }
          )
          if (!deleteResult.ok) throw new Error(deleteResult.error)
          result.deleted += 1
        } else {
          const payload = JSON.parse(entry.payload_json) as unknown
          const uploadResult = await window.electronAPI.setAdminDocument(
            entry.entity_type,
            entry.entity_id,
            payload
          )
          if (!uploadResult.ok) throw new Error(uploadResult.error)
          result.uploaded += 1
        }
        successIds.push(entry.id)
      } catch (e) {
        result.failed += 1
        failIds.push(entry.id)
        console.warn('[outbox] upload failed for', entry.entity_type, entry.entity_id, e)
      }
    }

    if (successIds.length) await window.electronAPI.outboxMarkSynced(successIds)
    if (failIds.length) await window.electronAPI.outboxMarkFailed(failIds)

    const { count } = await window.electronAPI.outboxCountPending()
    store.setPendingUpload(count)

    store.setSyncProgress(
      100,
      result.failed > 0 ? 'اكتمل الرفع مع أخطاء' : 'تم الرفع إلى Firebase'
    )
    window.setTimeout(() => {
      useSyncStore.getState().setSyncProgress(null, null)
    }, 1400)
  } finally {
    running = false
  }

  return result
}

/** Returns the number of pending outbox entries waiting to upload */
export async function getPendingUploadCount(): Promise<number> {
  const { count } = await window.electronAPI.outboxCountPending()
  return count
}
