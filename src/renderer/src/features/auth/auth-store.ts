import { create } from 'zustand'
import type { AppUser } from '@shared/types'

interface AuthState {
  user: AppUser | null
  loading: boolean
  setUser: (user: AppUser | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading })
}))
