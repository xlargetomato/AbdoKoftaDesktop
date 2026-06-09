import { useEffect } from 'react'
import { onSnapshotsInSync } from 'firebase/firestore'
import { firebaseConfig, getDb } from '@renderer/lib/firebase'
import { flushPendingWrites, useSyncStore } from './sync-store'
import { reconcileLocalCacheToFirestore } from './reconcile-service'

async function probeBackend(): Promise<boolean> {
  if (!navigator.onLine) return false
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 3500)
  try {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents?pageSize=1`,
      {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      }
    )
    return response.type === 'opaque' || response.status > 0
  } catch {
    return false
  } finally {
    window.clearTimeout(timeout)
  }
}

export function useSyncListener(): void {
  const setBrowserOnline = useSyncStore((s) => s.setBrowserOnline)
  const setBackendOnline = useSyncStore((s) => s.setBackendOnline)
  const setFirestorePending = useSyncStore((s) => s.setFirestorePending)

  useEffect(() => {
    let disposed = false
    let unsubSync: (() => void) | null = null
    let lastBackendOnline = false
    let initialReconcileDone = false

    function stopFirestoreSyncListener(): void {
      unsubSync?.()
      unsubSync = null
    }

    function startFirestoreSyncListener(): void {
      if (unsubSync) return
      unsubSync = onSnapshotsInSync(getDb(), () => {
        if (useSyncStore.getState().status !== 'offline') {
          setFirestorePending(false)
        }
      })
    }

    async function refreshBackendStatus(): Promise<void> {
      const online = await probeBackend()
      if (disposed) return
      const shouldReconcile = online && (!lastBackendOnline || !initialReconcileDone)
      setBackendOnline(online)
      lastBackendOnline = online
      if (online) {
        startFirestoreSyncListener()
        flushPendingWrites()
        if (shouldReconcile) {
          initialReconcileDone = true
          void reconcileLocalCacheToFirestore().catch((e) => {
            console.warn('[sync] reconcile failed', e)
          })
        }
      } else {
        stopFirestoreSyncListener()
      }
    }

    const onOnline = (): void => {
      setBrowserOnline(true)
      void refreshBackendStatus()
    }
    const onOffline = (): void => {
      setBrowserOnline(false)
      setBackendOnline(false)
      lastBackendOnline = false
      stopFirestoreSyncListener()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    setBrowserOnline(navigator.onLine)
    void refreshBackendStatus()

    const probeTimer = window.setInterval(() => {
      void refreshBackendStatus()
    }, 15000)

    return () => {
      disposed = true
      stopFirestoreSyncListener()
      window.clearInterval(probeTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [setBrowserOnline, setBackendOnline, setFirestorePending])
}
