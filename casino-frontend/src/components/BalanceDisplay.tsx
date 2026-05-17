'use client'
import { useEffect } from 'react'
import { useBalanceStore } from '@/store/balance'
import { useAuthStore } from '@/store/auth'

export default function BalanceDisplay() {
  const { balanceRub, fetch } = useBalanceStore()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())

  useEffect(() => {
    if (isAuthenticated) fetch()
  }, [isAuthenticated, fetch])

  if (!isAuthenticated) return null

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-casino-dark border border-casino-border rounded-lg">
      <span className="text-gray-400 text-sm">Баланс:</span>
      <span className="neon-text-cyan font-bold">
        {balanceRub !== null ? `${Number(balanceRub).toLocaleString('ru-RU')} ₽` : '...'}
      </span>
    </div>
  )
}
