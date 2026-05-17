'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'
import { BalanceTransaction } from '@/types'

const TYPE_LABEL: Record<BalanceTransaction['type'], string> = {
  DEPOSIT: 'Депозит',
  ADMIN_CREDIT: 'Начисление (admin)',
  ADMIN_DEBIT: 'Списание (admin)',
  GAME_WIN: 'Выигрыш',
  GAME_LOSS: 'Ставка',
  WITHDRAWAL: 'Вывод',
}

export default function TransactionList() {
  const [txns, setTxns] = useState<BalanceTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.get<BalanceTransaction[]>('/api/wallet/transactions', { signal: controller.signal })
      .then((r) => setTxns(r.data))
      .catch((err) => { if (!axios.isCancel(err)) setFetchError('Не удалось загрузить историю') })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  return (
    <div className="card">
      <h2 className="text-lg font-bold text-white mb-4">История транзакций</h2>
      {loading ? (
        <p className="text-gray-400">Загрузка...</p>
      ) : fetchError ? (
        <p className="text-red-400 text-sm">{fetchError}</p>
      ) : txns.length === 0 ? (
        <p className="text-gray-500">Нет транзакций</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {txns.map((tx) => {
            const isPositive = ['DEPOSIT', 'ADMIN_CREDIT', 'GAME_WIN'].includes(tx.type)
            return (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-casino-border last:border-0">
                <div>
                  <p className="text-sm text-white">{TYPE_LABEL[tx.type]}</p>
                  {tx.comment && <p className="text-xs text-gray-500">{tx.comment}</p>}
                  <p className="text-xs text-gray-600">
                    {new Date(tx.createdAt).toLocaleString('ru-RU')}
                  </p>
                </div>
                <span className={`font-bold ${isPositive ? 'text-casino-cyan' : 'text-red-400'}`}>
                  {isPositive ? '+' : '-'}{Math.abs(tx.amountRub).toLocaleString('ru-RU')} ₽
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
