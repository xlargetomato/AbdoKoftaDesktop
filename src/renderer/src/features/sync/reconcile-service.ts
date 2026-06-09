import { COLLECTIONS } from '@shared/constants/collections'
import type { AppUser } from '@shared/types'
import { cacheDocs, getCachedDocs } from '@renderer/lib/offline/sqlite-cache'
import {
  clearPendingLocalAuthUser,
  getPendingLocalAuthUsers
} from '@renderer/features/auth/auth-service'
import { useSyncStore } from './sync-store'

interface CachedDocument {
  id: string
  updatedAt?: number
  [key: string]: unknown
}

export interface ReconcileResult {
  checked: number
  uploaded: number
  refreshed: number
  failed: number
  issues: string[]
}

const SYNC_COLLECTIONS = Object.values(COLLECTIONS)
let running: Promise<ReconcileResult> | null = null

function isDocument(value: unknown): value is CachedDocument {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string'
}

function isRemoteNewer(local: CachedDocument, remote: CachedDocument): boolean {
  return Number(remote.updatedAt ?? 0) > Number(local.updatedAt ?? 0)
}

function shouldUploadLocal(local: CachedDocument, remote: CachedDocument | null): boolean {
  if (!remote) return true
  return Number(local.updatedAt ?? 0) > Number(remote.updatedAt ?? 0)
}

async function ensureLocalUserAuth(user: AppUser, issues: string[]): Promise<void> {
  if (!user.id.startsWith('local_')) return
  const pending = getPendingLocalAuthUsers().find((entry) => entry.uid === user.id)
  if (!pending) {
    issues.push(`الحساب المحلي ${user.username} يحتاج تسجيل دخول محلي مرة أخرى أو تغيير كلمة السر قبل مزامنة Firebase Auth`)
    return
  }
  const result = await window.electronAPI.ensureAuthUser({
    uid: pending.uid,
    email: pending.email,
    password: pending.password,
    displayName: pending.displayName
  })
  if (!result.ok) throw new Error(result.error ?? `فشل إنشاء Auth للحساب ${user.username}`)
  clearPendingLocalAuthUser(user.id)
}

async function readRemoteDocument(
  collectionName: string,
  documentId: string
): Promise<CachedDocument | null> {
  const result = await window.electronAPI.getAdminDocument(collectionName, documentId)
  if (!result.ok) throw new Error(result.error ?? `فشل قراءة ${collectionName}/${documentId}`)
  return isDocument(result.data) ? result.data : null
}

async function writeRemoteDocument(
  collectionName: string,
  document: CachedDocument
): Promise<void> {
  const result = await window.electronAPI.setAdminDocument(collectionName, document.id, document)
  if (!result.ok) throw new Error(result.error ?? `فشل رفع ${collectionName}/${document.id}`)
}

export async function reconcileLocalCacheToFirestore(): Promise<ReconcileResult> {
  if (running) return running

  running = (async () => {
    const store = useSyncStore.getState()
    const allDocs: Array<{ collectionName: string; document: CachedDocument }> = []
    const result: ReconcileResult = {
      checked: 0,
      uploaded: 0,
      refreshed: 0,
      failed: 0,
      issues: []
    }

    for (const collectionName of SYNC_COLLECTIONS) {
      const docs = (await getCachedDocs<unknown>(collectionName)).filter(isDocument)
      allDocs.push(...docs.map((document) => ({ collectionName, document })))
    }

    if (allDocs.length === 0) {
      store.setSyncProgress(null, null)
      return result
    }

    store.setSyncProgress(0, 'جاري المزامنة')

    for (const [index, item] of allDocs.entries()) {
      const progress = Math.round((index / allDocs.length) * 100)
      store.setSyncProgress(progress, 'جاري المزامنة')
      try {
        result.checked += 1
        if (item.collectionName === COLLECTIONS.users) {
          await ensureLocalUserAuth(item.document as unknown as AppUser, result.issues)
        }

        const remote = await readRemoteDocument(item.collectionName, item.document.id)
        if (shouldUploadLocal(item.document, remote)) {
          await writeRemoteDocument(item.collectionName, item.document)
          result.uploaded += 1
        } else if (remote && isRemoteNewer(item.document, remote)) {
          await cacheDocs(item.collectionName, [remote])
          result.refreshed += 1
        }
      } catch (e) {
        result.failed += 1
        result.issues.push(e instanceof Error ? e.message : String(e))
      }
    }

    if (result.issues.length > 0) {
      console.warn('[sync] reconcile issues', result.issues)
    }
    store.setSyncProgress(
      100,
      result.failed > 0 || result.issues.length > 0
        ? 'اكتملت المزامنة مع أخطاء'
        : 'تمت المزامنة'
    )
    window.setTimeout(() => {
      useSyncStore.getState().setSyncProgress(null, null)
    }, 1400)
    return result
  })().finally(() => {
    running = null
  })

  return running
}
