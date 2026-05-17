import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types'

interface AuthState {
  user: User | null
  setUser: (user: User) => void
  setAccessToken: (token: string) => void
  logout: () => void
  isAuthenticated: () => boolean
  getAccessToken: () => string | null
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),
      setAccessToken: (token) => {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('zw-access-token', token)
        }
      },
      logout: () => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('zw-access-token')
        }
        set({ user: null })
      },
      isAuthenticated: () => {
        if (typeof window === 'undefined') return false
        return !!sessionStorage.getItem('zw-access-token') && !!get().user
      },
      getAccessToken: () => {
        if (typeof window === 'undefined') return null
        return sessionStorage.getItem('zw-access-token')
      },
    }),
    {
      name: 'zw-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
