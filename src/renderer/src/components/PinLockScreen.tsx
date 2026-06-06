import { useState, useEffect, useCallback } from 'react'
import { usePinStore, verifyPin } from '@renderer/features/auth/pin-store'
import { useAuthStore } from '@renderer/features/auth/auth-store'
import { RESTAURANT_NAME_AR } from '@shared/constants/branding'
import { MdLock } from 'react-icons/md'

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export function PinLockScreen(): React.ReactElement | null {
  const locked = usePinStore((s) => s.locked)
  const unlock = usePinStore((s) => s.unlock)
  const user = useAuthStore((s) => s.user)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)

  const handleDelete = useCallback((): void => {
    setPin((p) => p.slice(0, -1))
    setError('')
  }, [])

  const checkPin = useCallback(async (entered: string): Promise<void> => {
    const pinHash = user?.pinHash
    if (!pinHash) {
      unlock()
      setPin('')
      return
    }
    const ok = await verifyPin(entered, pinHash)
    if (ok) {
      unlock()
      setPin('')
      setError('')
    } else {
      setError('رمز PIN غير صحيح')
      setShaking(true)
      setTimeout(() => { setShaking(false); setPin('') }, 600)
    }
  }, [user, unlock])

  const handleDigit = useCallback((d: string): void => {
    setPin((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + d
      setError('')
      if (next.length === 4) void checkPin(next)
      return next
    })
  }, [checkPin])

  // Physical keyboard support — hook is always called, just no-ops when not locked
  useEffect(() => {
    if (!locked) return
    function onKey(e: KeyboardEvent): void {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key)
      else if (e.key === 'Backspace') handleDelete()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, handleDigit, handleDelete])

  // Don't render when not locked — but hooks above are always called
  if (!locked) return null

  return (
    <div className="pin-overlay" role="dialog" aria-modal="true" aria-label="شاشة القفل">
      <div className={`pin-card${shaking ? ' pin-card--shake' : ''}`}>
        <MdLock className="pin-lock-icon" aria-hidden="true" />
        <h2 className="pin-title">{RESTAURANT_NAME_AR}</h2>
        {user && <p className="pin-user">{user.displayName}</p>}
        <p className="pin-prompt">أدخل رمز PIN للمتابعة</p>

        {/* Dots */}
        <div className="pin-dots" aria-label={`تم إدخال ${pin.length} أرقام`}>
          {[0,1,2,3].map((i) => (
            <span key={i} className={`pin-dot${pin.length > i ? ' pin-dot--filled' : ''}`} />
          ))}
        </div>

        {error && <p className="pin-error" role="alert">{error}</p>}

        {/* Numpad — dir=ltr forces correct left-to-right number order */}
        <div className="pin-numpad" dir="ltr">
          {DIGITS.map((d, i) => (
            d === '' ? (
              <span key={i} />
            ) : d === '⌫' ? (
              <button key={i} type="button" className="pin-key pin-key--delete"
                onClick={handleDelete} aria-label="حذف">
                ⌫
              </button>
            ) : (
              <button key={i} type="button" className="pin-key"
                onClick={() => handleDigit(d)}>
                {d}
              </button>
            )
          ))}
        </div>
      </div>
    </div>
  )
}
