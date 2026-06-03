import { useEffect, useRef } from 'react'
import { onAuthStateChanged, signOut, auth } from '@renderer/lib/firebase'
import { useAuthStore } from './auth-store'
import { fetchAppUser } from './auth-service'

/**
 * Restores session on app load only.
 * Does not fight with LoginPage — never clears user on transient Firestore errors.
 */
export function useAuthBootstrap(): void {
  const setUser = useAuthStore((s) => s.setUser)
  const setLoading = useAuthStore((s) => s.setLoading)
  const initialCheckDone = useRef(false)

  useEffect(() => {
    setLoading(true)

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        if (initialCheckDone.current) {
          useAuthStore.getState().setUser(null)
        } else {
          setUser(null)
        }
        initialCheckDone.current = true
        return
      }

      try {
        const appUser = await fetchAppUser(fbUser.uid)
        if (!appUser?.active) {
          console.warn('[auth] profile missing or inactive for', fbUser.uid)
          await signOut(auth)
          setUser(null)
        } else {
          setUser(appUser)
        }
      } catch (e) {
        console.error('[auth bootstrap] profile load failed:', e)
        // Keep existing store user if login just set it; only clear on cold start
        if (!initialCheckDone.current) {
          setUser(null)
        }
      } finally {
        initialCheckDone.current = true
        setLoading(false)
      }
    })

    return () => unsub()
  }, [setUser, setLoading])
}
