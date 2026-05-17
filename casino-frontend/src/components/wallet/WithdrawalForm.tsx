'use client'
import { useState } from 'react'
import api from '@/lib/api'
import { useBalanceStore } from '@/store/balance'

export default function WithdrawalForm() {
  const [amountRub, setAmountRub] = useState('')
  const [trc20Address, setTrc20Address] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const { fetch: fetchBalance } = useBalanceStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)
    try {
      await api.post('/api/wallet/withdraw', {
        amountRub: Number(amountRub),
        trc20Address,
      })
      setSuccess(true)
      setAmountRub('')
      setTrc20Address('')
      await fetchBalance()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error ?? 'Ошибка вывода')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-bold text-casino-purple mb-4">Вывод средств</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm text-gray-400 block mb-1">Сумма (₽)</label>
          <input
            type="number"
            value={amountRub}
            onChange={(e) => setAmountRub(e.target.value)}
            className="input-field"
            placeholder="1000"
            min={100}
            required
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-1">TRC20 адрес получателя</label>
          <input
            type="text"
            value={trc20Address}
            onChange={(e) => setTrc20Address(e.target.value)}
            className="input-field font-mono text-sm"
            placeholder="T..."
            required
            minLength={34}
            maxLength={34}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && (
          <p className="text-green-400 text-sm bg-green-900/20 border border-green-800 rounded px-3 py-2">
            ✅ Заявка на вывод создана. Обрабатывается саппортом.
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
          {loading ? 'Отправка...' : 'Запросить вывод'}
        </button>

        <p className="text-xs text-gray-500">
          Вывод обрабатывается вручную саппортом в течение 24 часов.
        </p>
      </form>
    </div>
  )
}
