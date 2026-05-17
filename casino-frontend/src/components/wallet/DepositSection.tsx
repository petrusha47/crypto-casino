'use client'
import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'

export default function DepositSection() {
  const [address, setAddress] = useState('')
  const [fetchError, setFetchError] = useState('')
  const [copyError, setCopyError] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    api.get<{ trc20Address: string }>('/api/wallet/deposit-address', { signal: controller.signal })
      .then((r) => setAddress(r.data.trc20Address))
      .catch((err) => { if (!axios.isCancel(err)) setFetchError('Не удалось загрузить адрес') })
      .finally(() => setLoading(false))
    return () => {
      controller.abort()
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setCopyError('')
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError('Не удалось скопировать. Скопируйте вручную.')
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-bold text-casino-cyan mb-4">Пополнение (USDT TRC20)</h2>
      {loading ? (
        <p className="text-gray-400">Загрузка адреса...</p>
      ) : fetchError ? (
        <p className="text-red-400 text-sm">{fetchError}</p>
      ) : (
        <div className="space-y-4">
          <div className="bg-casino-bg border border-casino-border rounded-lg p-4 font-mono text-sm break-all text-white">
            {address}
          </div>
          <button onClick={copy} className="btn-cyan w-full" aria-label="Копировать адрес кошелька">
            {copied ? '✅ Скопировано!' : '📋 Копировать адрес'}
          </button>
          {copyError && <p className="text-red-400 text-xs">{copyError}</p>}
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
