'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'

interface Withdrawal {
  id: string
  amountRub: number
  trc20Address: string
  status: string
  createdAt: string
  reviewNote?: string
  user: { username: string; email: string }
}

const STATUS_TABS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const
type StatusTab = typeof STATUS_TABS[number]

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Ожидает', APPROVED: 'Одобрен', REJECTED: 'Отклонён',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-yellow-400 bg-yellow-900/30',
  APPROVED: 'text-green-400 bg-green-900/30',
  REJECTED: 'text-red-400 bg-red-900/30',
}

export default function AdminWithdrawalsPage() {
  const [tab, setTab] = useState<StatusTab>('PENDING')
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [reviewing, setReviewing] = useState<string | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewError, setReviewError] = useState('')

  const load = () => {
    const controller = new AbortController()
    setLoading(true)
    api.get<{ withdrawals: Withdrawal[] }>(`/api/admin/withdrawals?status=${tab}`, { signal: controller.signal })
      .then((r) => setWithdrawals(r.data.withdrawals))
      .catch((err) => { if (!axios.isCancel(err)) setError('Ошибка загрузки') })
      .finally(() => setLoading(false))
    return controller
  }

  useEffect(() => { const c = load(); return () => c.abort() }, [tab])

  const openModal = (id: string, action: 'approve' | 'reject') => {
    setReviewing(id)
    setReviewAction(action)
    setReviewNote('')
    setReviewError('')
  }

  const submitReview = async () => {
    if (!reviewing) return
    if (reviewAction === 'reject' && !reviewNote.trim()) {
      setReviewError('Укажите причину отказа')
      return
    }
    try {
      await api.patch(`/api/admin/withdrawals/${reviewing}/review`, {
        action: reviewAction,
        reviewNote: reviewNote.trim() || undefined,
      })
      setReviewing(null)
      load()
    } catch (err) {
      if (axios.isAxiosError(err)) setReviewError(err.response?.data?.error ?? 'Ошибка')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Выводы средств</h1>

      <div className="flex gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${
              tab === s ? 'bg-casino-purple text-white' : 'text-gray-400 hover:text-white border border-casino-border'
            }`}
          >
            {s === 'ALL' ? 'Все' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-casino-border">
              <th className="pb-3 pr-4">Игрок</th>
              <th className="pb-3 pr-4">Сумма</th>
              <th className="pb-3 pr-4">TRC20 адрес</th>
              <th className="pb-3 pr-4">Дата</th>
              <th className="pb-3 pr-4">Статус</th>
              <th className="pb-3">Действие</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">Загрузка...</td></tr>
            ) : withdrawals.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Нет заявок</td></tr>
            ) : withdrawals.map((w) => (
              <tr key={w.id} className="border-b border-casino-border">
                <td className="py-3 pr-4">
                  <p className="text-white">{w.user.username}</p>
                  <p className="text-xs text-gray-500">{w.user.email}</p>
                </td>
                <td className="py-3 pr-4 font-bold text-casino-cyan">{w.amountRub.toLocaleString('ru-RU')} ₽</td>
                <td className="py-3 pr-4 font-mono text-xs text-gray-400 break-all max-w-32">{w.trc20Address}</td>
                <td className="py-3 pr-4 text-gray-500 text-xs">{new Date(w.createdAt).toLocaleString('ru-RU')}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[w.status] ?? 'text-gray-400 bg-gray-800'}`}>
                    {STATUS_LABEL[w.status] ?? w.status}
                  </span>
                  {w.reviewNote && <p className="text-xs text-gray-600 mt-1 max-w-32 truncate" title={w.reviewNote}>{w.reviewNote}</p>}
                </td>
                <td className="py-3">
                  {w.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button onClick={() => openModal(w.id, 'approve')} className="btn-cyan text-xs py-1 px-2">Одобрить</button>
                      <button onClick={() => openModal(w.id, 'reject')} className="btn-danger text-xs py-1 px-2">Отклонить</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reviewing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-bold text-white mb-4">
              {reviewAction === 'approve' ? '✅ Одобрить вывод' : '❌ Отклонить вывод'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 block mb-1">
                  {reviewAction === 'reject' ? 'Причина отказа (обязательно)' : 'Комментарий (необязательно)'}
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="input-field w-full h-24 resize-none text-sm"
                  placeholder={reviewAction === 'reject' ? 'Укажите причину...' : 'Необязательно...'}
                />
              </div>
              {reviewError && <p className="text-red-400 text-sm">{reviewError}</p>}
              <div className="flex gap-3">
                <button onClick={submitReview} className={reviewAction === 'approve' ? 'btn-cyan flex-1' : 'btn-danger flex-1'}>
                  Подтвердить
                </button>
                <button onClick={() => setReviewing(null)} className="border border-casino-border text-gray-400 rounded px-4 py-2 hover:text-white transition-colors">
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
