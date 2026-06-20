'use client'
import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import api from '@/lib/api'

interface TxnRow {
  id: string
  type: string
  amountRub: number
  comment?: string
  createdAt: string
  user: { username: string; email: string }
}

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Депозит',
  ADMIN_CREDIT: 'Начисление (admin)',
  ADMIN_DEBIT: 'Списание (admin)',
  GAME_WIN: 'Выигрыш',
  GAME_LOSS: 'Ставка',
  WITHDRAWAL: 'Вывод',
}
const POSITIVE_TYPES = new Set(['DEPOSIT', 'ADMIN_CREDIT', 'GAME_WIN'])
const TX_TYPES = ['', 'DEPOSIT', 'WITHDRAWAL', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'GAME_WIN', 'GAME_LOSS']

export default function AdminTransactionsPage() {
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    const controller = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (typeFilter) params.set('type', typeFilter)
    api.get<{ txns: TxnRow[]; total: number; page: number; pageSize: number }>(
      `/api/admin/transactions?${params}`,
      { signal: controller.signal },
    )
      .then((r) => { setTxns(r.data.txns); setTotal(r.data.total) })
      .catch((err) => { if (!axios.isCancel(err)) setError('Ошибка загрузки') })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [page, typeFilter])

  useEffect(() => load(), [load])

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Транзакции</h1>

      <div className="flex items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="input-field max-w-xs text-sm"
        >
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>{t ? TYPE_LABEL[t] ?? t : 'Все типы'}</option>
          ))}
        </select>
        <span className="text-gray-500 text-sm">Всего: {total.toLocaleString('ru-RU')}</span>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-casino-border">
              <th className="pb-3 pr-4">Игрок</th>
              <th className="pb-3 pr-4">Тип</th>
              <th className="pb-3 pr-4">Сумма</th>
              <th className="pb-3 pr-4">Комментарий</th>
              <th className="pb-3">Дата</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">Загрузка...</td></tr>
            ) : txns.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-500">Нет транзакций</td></tr>
            ) : txns.map((tx) => {
              const isPos = POSITIVE_TYPES.has(tx.type)
              return (
                <tr key={tx.id} className="border-b border-casino-border hover:bg-white/5">
                  <td className="py-3 pr-4">
                    <p className="text-white">{tx.user.username}</p>
                    <p className="text-xs text-gray-500">{tx.user.email}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      isPos ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                    }`}>
                      {TYPE_LABEL[tx.type] ?? tx.type}
                    </span>
                  </td>
                  <td className={`py-3 pr-4 font-bold ${isPos ? 'text-casino-cyan' : 'text-red-400'}`}>
                    {isPos ? '+' : '-'}{Math.abs(tx.amountRub).toLocaleString('ru-RU')} ₽
                  </td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">{tx.comment ?? '—'}</td>
                  <td className="py-3 text-gray-500 text-xs">
                    {new Date(tx.createdAt).toLocaleString('ru-RU')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="btn-primary py-1 px-3 text-sm disabled:opacity-50">←</button>
          <span className="text-gray-400 text-sm">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="btn-primary py-1 px-3 text-sm disabled:opacity-50">→</button>
        </div>
      )}
    </div>
  )
}
