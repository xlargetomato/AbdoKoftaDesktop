import { useEffect } from 'react'
import { usePinStore } from './pin-store'
import { getSettings } from '@renderer/features/orders/order-service'
import { useAuthStore } from './auth-store'

export function usePinBootstrap(): void {
  const configure = usePinStore((s) => s.configure)
  const resetTimer = usePinStore((s) => s.resetTimer)
  const user = useAuthStore((s) => s.user)

  // Load settings and configure PIN on login
  useEffect(() => {
    if (!user) return
    void getSettings().then((s) => {
      // Only enable PIN for cashiers (managers don't need it)
      const shouldEnable = s.pinEnabled && user.role === 'cashier' && !!user.pinHash
      configure(shouldEnable, s.autoLockMinutes ?? 5)
    })
  }, [user, configure])

  // Reset auto-lock timer on any user interaction
  useEffect(() => {
    if (!user) return
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    const handler = (): void => resetTimer()
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, handler))
  }, [user, resetTimer])
}
