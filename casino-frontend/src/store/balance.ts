import { create } from 'zustand'
import api from '@/lib/api'

interface BalanceState {
  balanceRub: number | null
  loading: boolean
  fetch: () => Promise<void>
  setBalance: (b: number) => void
}

export const useBalanceStore = create<BalanceState>((set) => ({
  balanceRub: null,
  loading: false,
  fetch: async () => {
    set({ loading: true })
    try {
      const res = await api.get<{ balanceRub: number }>('/api/user/balance')
      set({ balanceRub: Number(res.data.balanceRub) })
    } catch {
      // ignore
    } finally {
      set({ loading: false })
    }
  },
  setBalance: (b) => set({ balanceRub: b }),
}))
