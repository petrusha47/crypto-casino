'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'

export default function DepositSection() {
  const [address, setAddress] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ trc20Address: string }>('/api/wallet/deposit-address')
      .then((r) => setAddress(r.data.trc20Address))
      .catch(() => setAddress('Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [])

  const copy = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card">
      <h2 className="text-lg font-bold text-casino-cyan mb-4">Пополнение (USDT TRC20)</h2>
      {loading ? (
        <p className="text-gray-400">Загрузка адреса...</p>
      ) : (
        <div className="space-y-4">
          <div className="bg-casino-bg border border-casino-border rounded-lg p-4 font-mono text-sm break-all text-white">
            {address}
          </div>
          <button onClick={copy} className="btn-cyan w-full">
            {copied ? '✅ Скопировано!' : '📋 Копировать адрес'}
          </button>
          <div className="text-xs text-gray-500 space-y-1">
            <p>• Минимальный депозит: 1 USDT</p>
            <p>• Сеть: TRC20 (Tron)</p>
            <p>• Зачисление после 6 подтверждений (~1 мин)</p>
            <p>• Курс ЦБ РФ на момент зачисления</p>
          </div>
        </div>
      )}
    </div>
  )
}
