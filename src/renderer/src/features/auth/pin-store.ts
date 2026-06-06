import { create } from 'zustand'

/** Hash a PIN using Web Crypto (SHA-256) */
export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return (await hashPin(pin)) === hash
}

interface PinState {
  locked: boolean
  pinEnabled: boolean
  autoLockMinutes: number
  _timerId: ReturnType<typeof setTimeout> | null

  lock: () => void
  unlock: () => void
  configure: (pinEnabled: boolean, autoLockMinutes: number) => void
  resetTimer: () => void          // call on any user activity
}

export const usePinStore = create<PinState>((set, get) => ({
  locked: false,
  pinEnabled: false,
  autoLockMinutes: 5,
  _timerId: null,

  lock: () => {
    const { _timerId } = get()
    if (_timerId) clearTimeout(_timerId)
    set({ locked: true, _timerId: null })
  },

  unlock: () => {
    set({ locked: false })
    get().resetTimer()
  },

  configure: (pinEnabled, autoLockMinutes) => {
    set({ pinEnabled, autoLockMinutes })
    get().resetTimer()
  },

  resetTimer: () => {
    const { _timerId, pinEnabled, autoLockMinutes, locked } = get()
    if (_timerId) clearTimeout(_timerId)
    if (!pinEnabled || autoLockMinutes === 0 || locked) {
      set({ _timerId: null })
      return
    }
    const id = setTimeout(() => {
      usePinStore.getState().lock()
    }, autoLockMinutes * 60 * 1000)
    set({ _timerId: id })
  }
}))
