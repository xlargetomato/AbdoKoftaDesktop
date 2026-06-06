import { create } from 'zustand'
import { waitForPendingWrites } from 'firebase/firestore'
import { getDb } from '@renderer/lib/firebase'

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'synced'

const DURABLE_PENDING_KEY = 'abdokofta.sync.pendingWrites'

function readDurablePending(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DURABLE_PENDING_KEY) === '1'
}

function writeDurablePending(pending: boolean): void {
  if (typeof window === 'undefined') return
  if (pending) {
    window.localStorage.setItem(DURABLE_PENDING_KEY, '1')
  } else {
    window.localStorage.removeItem(DURABLE_PENDING_KEY)
  }
}

interface SyncState {
  browserOnline: boolean
  backendOnline: boolean
  firestorePending: boolean
  status: SyncStatus
  // Called by useSyncListener
  setBrowserOnline: (online: boolean) => void
  setBackendOnline: (online: boolean) => void
  setFirestorePending: (pending: boolean) => void
  // Called by write operations (order-service, inventory-service, etc.)
  // to show yellow only when real writes are in-flight
  pendingWrites: number
  markWriteStart: () => void
  markWriteDone: () => void
}

function deriveStatus(
  browserOnline: boolean,
  backendOnline: boolean,
  firestorePending: boolean
): SyncStatus {
  if (!browserOnline || !backendOnline) return 'offline'
  if (firestorePending) return 'syncing'
  return 'online'
}

export const useSyncStore = create<SyncState>((set, get) => ({
  browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  backendOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  firestorePending: readDurablePending(),
  pendingWrites: 0,
  status: deriveStatus(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
    typeof navigator !== 'undefined' ? navigator.onLine : true,
    readDurablePending()
  ),

  setBrowserOnline: (online) => {
    const { backendOnline, firestorePending } = get()
    set({
      browserOnline: online,
      status: deriveStatus(online, backendOnline, firestorePending)
    })
  },

  setBackendOnline: (online) => {
    const { browserOnline, firestorePending } = get()
    set({
      backendOnline: online,
      status: deriveStatus(browserOnline, online, firestorePending)
    })
  },

  setFirestorePending: (pending) => {
    const { browserOnline, backendOnline, pendingWrites } = get()
    // Don't clear pending if there are still in-flight writes
    const effectivePending = pending || pendingWrites > 0
    writeDurablePending(effectivePending)
    set({
      firestorePending: effectivePending,
      status: deriveStatus(browserOnline, backendOnline, effectivePending)
    })
  },

  markWriteStart: () => {
    const { browserOnline, backendOnline } = get()
    const pendingWrites = get().pendingWrites + 1
    writeDurablePending(true)
    set({
      pendingWrites,
      firestorePending: true,
      status: deriveStatus(browserOnline, backendOnline, true)
    })
  },

  markWriteDone: () => {
    const { browserOnline, backendOnline } = get()
    const pendingWrites = Math.max(0, get().pendingWrites - 1)
    const online = browserOnline && backendOnline
    const firestorePending = pendingWrites > 0 || (!online && readDurablePending())
    if (!firestorePending) writeDurablePending(false)
    set({
      pendingWrites,
      firestorePending,
      status: deriveStatus(browserOnline, backendOnline, firestorePending)
    })
  }
}))

export function isAppOffline(): boolean {
  return useSyncStore.getState().status === 'offline'
}

/** Helper to wrap any async Firestore write with sync tracking */
export async function trackWrite<T>(fn: () => Promise<T>): Promise<T> {
  if (isAppOffline()) {
    throw new Error('لا يمكن استخدام Firestore أثناء وضع عدم الاتصال')
  }
  const store = useSyncStore.getState()
  store.markWriteStart()
  try {
    const result = await fn()
    if (!isAppOffline()) {
      void waitForPendingWrites(getDb()).finally(() => {
        useSyncStore.getState().markWriteDone()
      })
    } else {
      store.markWriteDone()
    }
    return result
  } catch (e) {
    store.markWriteDone()
    throw e
  }
}

export function flushPendingWrites(): void {
  const store = useSyncStore.getState()
  if (isAppOffline()) return
  store.setFirestorePending(true)
  void waitForPendingWrites(getDb())
    .catch((e) => {
      console.warn('[sync] waitForPendingWrites failed', e)
    })
    .finally(() => {
      useSyncStore.getState().setFirestorePending(false)
    })
}
