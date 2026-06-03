import { useEffect } from 'react'
import { onSnapshotsInSync } from 'firebase/firestore'
import { getDb } from '@renderer/lib/firebase'
import { useSyncStore } from './sync-store'

/**
 * Wires up network + Firestore sync state.
 *
 * Previous implementation polled waitForPendingWrites() every 3 seconds
 * and optimistically set firestorePending=true before the check — causing
 * a yellow flash on every cycle (and a longer one on startup while Firestore
 * initializes).
 *
 * New approach:
 * - network online/offline → drives networkOnline
 * - onSnapshotsInSync      → fires when all active listeners are caught up
 *                            → clears the pending flag
 * - setFirestorePending(true) is called from the write helpers in the store
 *   (see sync-store.ts markWriteStart/markWriteDone) so yellow only appears
 *   when there are real in-flight writes
 * - On startup we do NOT set pending=true at all — the initial state is
 *   already correct (no pending writes when the app just opened)
 */
export function useSyncListener(): void {
  const setNetworkOnline = useSyncStore((s) => s.setNetworkOnline)
  const setFirestorePending = useSyncStore((s) => s.setFirestorePending)

  useEffect(() => {
    // Network state
    const onOnline = (): void => setNetworkOnline(true)
    const onOffline = (): void => {
      setNetworkOnline(false)
      setFirestorePending(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    // Sync with current state (no flash — doesn't touch firestorePending)
    setNetworkOnline(navigator.onLine)

    // Firestore sync — clears the pending flag once all listeners are caught up
    const db = getDb()
    const unsubSync = onSnapshotsInSync(db, () => {
      if (navigator.onLine) setFirestorePending(false)
    })

    return () => {
      unsubSync()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [setNetworkOnline, setFirestorePending])
}
