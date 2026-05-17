'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { PokerTableInfo } from '@/types'

export default function PokerLobbyPage() {
  const [tables, setTables] = useState<PokerTableInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<PokerTableInfo[]>('/api/user/poker-tables')
      .then((r) => setTables(r.data))
      .catch(() => setTables([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-3xl font-bold neon-text-purple mb-8 text-center">🃏 ПОКЕР</h1>
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="card text-center text-gray-400 py-12">Загрузка столов...</div>
        ) : tables.length === 0 ? (
          <div className="card text-center text-gray-400 py-12">
            Нет активных столов. Столы создаются администратором.
          </div>
        ) : (
          <div className="space-y-4">
            {tables.map((table) => (
              <div key={table.id} className="card flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white">{table.name}</h2>
                  <p className="text-gray-400 text-sm">
                    Мин. ставка: {Number(table.minBetRub).toLocaleString('ru-RU')} ₽ ·
                    Макс: {Number(table.maxBetRub).toLocaleString('ru-RU')} ₽
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    table.status === 'WAITING' ? 'bg-yellow-900/30 text-yellow-400' :
                    table.status === 'ACTIVE' ? 'bg-green-900/30 text-green-400' :
                    'bg-gray-800 text-gray-500'
                  }`}>
                    {table.status === 'WAITING' ? 'Ожидание' : table.status === 'ACTIVE' ? 'Активный' : 'Закончен'}
                  </span>
                </div>
                <Link href={`/games/poker/${table.id}`} className="btn-primary py-2 px-4">
                  Войти
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
