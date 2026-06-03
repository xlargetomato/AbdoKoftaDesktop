import { create } from 'zustand'

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'synced'

interface SyncState {
  networkOnline: boolean
  firestorePending: boolean
  status: SyncStatus
  // Called by useSyncListener
  setNetworkOnline: (online: boolean) => void
  setFirestorePending: (pending: boolean) => void
  // Called by write operations (order-service, inventory-service, etc.)
  // to show yellow only when real writes are in-flight
  pendingWrites: number
  markWriteStart: () => void
  markWriteDone: () => void
}

function deriveStatus(
  networkOnline: boolean,
  firestorePending: boolean
): SyncStatus {
  if (!networkOnline) return 'offline'
  if (firestorePending) return 'syncing'
  return 'synced'
}

export const useSyncStore = create<SyncState>((set, get) => ({
  networkOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  firestorePending: false,
  pendingWrites: 0,
  // Derived correctly on init (no hardcoded 'synced')
  status: deriveStatus(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
    false
  ),

  setNetworkOnline: (online) => {
    const { firestorePending } = get()
    set({ networkOnline: online, status: deriveStatus(online, firestorePending) })
  },

  setFirestorePending: (pending) => {
    const { networkOnline, pendingWrites } = get()
    // Don't clear pending if there are still in-flight writes
    const effectivePending = pending || pendingWrites > 0
    set({
      firestorePending: effectivePending,
      status: deriveStatus(networkOnline, effectivePending)
    })
  },

  markWriteStart: () => {
    const { networkOnline } = get()
    const pendingWrites = get().pendingWrites + 1
    set({
      pendingWrites,
      firestorePending: true,
      status: deriveStatus(networkOnline, true)
    })
  },

  markWriteDone: () => {
    const { networkOnline } = get()
    const pendingWrites = Math.max(0, get().pendingWrites - 1)
    const firestorePending = pendingWrites > 0
    set({
      pendingWrites,
      firestorePending,
      status: deriveStatus(networkOnline, firestorePending)
    })
  }
}))

/** Helper to wrap any async Firestore write with sync tracking */
export async function trackWrite<T>(fn: () => Promise<T>): Promise<T> {
  const store = useSyncStore.getState()
  store.markWriteStart()
  try {
    return await fn()
  } finally {
    store.markWriteDone()
  }
}
