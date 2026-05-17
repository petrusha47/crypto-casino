'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'

interface Stats {
  totalUsers: number
  totalBalanceRub: number
  pendingWithdrawals: number
  pendingWithdrawalsRub: number
  roundsToday: number
  roundsWeek: number
  topPlayers: { username: string; balanceRub: number }[]
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.get<Stats>('/api/admin/stats', { signal: controller.signal })
      .then((r) => setStats(r.data))
      .catch((err) => { if (!axios.isCancel(err)) setError('Не удалось загрузить статистику') })
    return () => controller.abort()
  }, [])

  if (error) return <p className="text-red-400">{error}</p>
  if (!stats) return <p className="text-gray-400">Загрузка...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Дашборд</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Пользователей" value={stats.totalUsers.toLocaleString('ru-RU')} />
        <StatCard label="Суммарный баланс" value={`${stats.totalBalanceRub.toLocaleString('ru-RU')} ₽`} />
        <StatCard
          label="Выводы ожидают"
          value={`${stats.pendingWithdrawals} (${stats.pendingWithdrawalsRub.toLocaleString('ru-RU')} ₽)`}
        />
        <StatCard label="Раундов за неделю" value={stats.roundsWeek.toLocaleString('ru-RU')} />
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">Топ игроков по балансу</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="pb-2">#</th>
              <th className="pb-2">Игрок</th>
              <th className="pb-2 text-right">Баланс</th>
            </tr>
          </thead>
          <tbody>
            {stats.topPlayers.map((p, i) => (
              <tr key={p.username} className="border-t border-casino-border">
                <td className="py-2 text-gray-600">{i + 1}</td>
                <td className="py-2 text-white">{p.username}</td>
                <td className="py-2 text-right text-casino-cyan">{p.balanceRub.toLocaleString('ru-RU')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
