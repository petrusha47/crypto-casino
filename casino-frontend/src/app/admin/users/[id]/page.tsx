'use client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'

interface AdminUserDetail {
  id: string
  email: string
  username: string
  role: string
  balanceRub: number
  isBanned: boolean
  createdAt: string
}

interface TxnRow {
  id: string
  type: string
  amountRub: number
  comment?: string
  createdAt: string
}

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Депозит', ADMIN_CREDIT: 'Начисление (admin)', ADMIN_DEBIT: 'Списание (admin)',
  GAME_WIN: 'Выигрыш', GAME_LOSS: 'Ставка', WITHDRAWAL: 'Вывод',
}
const POSITIVE_TYPES = new Set(['DEPOSIT', 'ADMIN_CREDIT', 'GAME_WIN'])

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const adminUser = useAuthStore((s) => s.user)
  const isAdmin = adminUser?.role === 'ADMIN'

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const [creditAmount, setCreditAmount] = useState('')
  const [creditComment, setCreditComment] = useState('')
  const [debitAmount, setDebitAmount] = useState('')
  const [debitComment, setDebitComment] = useState('')
  const [selectedRole, setSelectedRole] = useState('')

  const load = () => {
    api.get<{ user: AdminUserDetail; recentTxns: TxnRow[] }>(`/api/admin/users/${id}`)
      .then((r) => { setUser(r.data.user); setTxns(r.data.recentTxns); setSelectedRole(r.data.user.role) })
      .catch(() => setError('Не удалось загрузить пользователя'))
  }

  useEffect(() => { load() }, [id])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const toggleBan = async () => {
    if (!user) return
    await api.patch(`/api/admin/users/${id}/ban`, { isBanned: !user.isBanned })
    flash(user.isBanned ? 'Разбанен' : 'Забанен')
    load()
  }

  const changeRole = async () => {
    await api.patch(`/api/admin/users/${id}/role`, { role: selectedRole })
    flash('Роль изменена')
    load()
  }

  const credit = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.post(`/api/admin/users/${id}/credit`, { amountRub: Number(creditAmount), comment: creditComment || undefined })
    flash(`Зачислено ${creditAmount} ₽`)
    setCreditAmount(''); setCreditComment('')
    load()
  }

  const debit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post(`/api/admin/users/${id}/debit`, { amountRub: Number(debitAmount), comment: debitComment || undefined })
      flash(`Списано ${debitAmount} ₽`)
      setDebitAmount(''); setDebitComment('')
      load()
    } catch (err) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.error ?? 'Ошибка')
    }
  }

  if (error) return <p className="text-red-400">{error}</p>
  if (!user) return <p className="text-gray-400">Загрузка...</p>

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/admin/users')} className="text-gray-500 hover:text-white text-sm">← Назад</button>
        <h1 className="text-2xl font-bold text-white">{user.username}</h1>
      </div>

      {msg && <p className="text-green-400 text-sm bg-green-900/20 border border-green-800 rounded px-3 py-2">{msg}</p>}

      <div className="card space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-400">Email</span><span className="text-white">{user.email}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Роль</span><span className="text-white">{user.role}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Баланс</span><span className="text-casino-cyan font-bold">{user.balanceRub.toLocaleString('ru-RU')} ₽</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Статус</span><span className={user.isBanned ? 'text-red-400' : 'text-green-400'}>{user.isBanned ? 'Забанен' : 'Активен'}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">ID</span><span className="text-gray-600 font-mono text-xs">{user.id}</span></div>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card">
            <h3 className="font-bold text-white mb-3">Бан</h3>
            <button onClick={toggleBan} className={user.isBanned ? 'btn-primary w-full' : 'btn-danger w-full'}>
              {user.isBanned ? 'Разбанить' : 'Забанить'}
            </button>
          </div>

          <div className="card">
            <h3 className="font-bold text-white mb-3">Роль</h3>
            <div className="flex gap-2">
              <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="input-field flex-1 text-sm">
                <option value="USER">USER</option>
                <option value="SUPPORT">SUPPORT</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button onClick={changeRole} className="btn-primary px-3 text-sm">Сохранить</button>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold text-white mb-3">Зачислить</h3>
            <form onSubmit={credit} className="space-y-2">
              <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className="input-field text-sm" placeholder="Сумма ₽" min={1} required />
              <input type="text" value={creditComment} onChange={(e) => setCreditComment(e.target.value)} className="input-field text-sm" placeholder="Комментарий (необязательно)" />
              <button type="submit" className="btn-cyan w-full text-sm">Зачислить</button>
            </form>
          </div>

          <div className="card">
            <h3 className="font-bold text-white mb-3">Списать</h3>
            <form onSubmit={debit} className="space-y-2">
              <input type="number" value={debitAmount} onChange={(e) => setDebitAmount(e.target.value)} className="input-field text-sm" placeholder="Сумма ₽" min={1} required />
              <input type="text" value={debitComment} onChange={(e) => setDebitComment(e.target.value)} className="input-field text-sm" placeholder="Комментарий (необязательно)" />
              <button type="submit" className="btn-danger w-full text-sm">Списать</button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">Последние транзакции</h2>
        {txns.length === 0 ? (
          <p className="text-gray-500 text-sm">Нет транзакций</p>
        ) : (
          <div className="space-y-1">
            {txns.map((tx) => {
              const isPos = POSITIVE_TYPES.has(tx.type)
              return (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-casino-border last:border-0">
                  <div>
                    <p className="text-sm text-white">{TYPE_LABEL[tx.type] ?? tx.type}</p>
                    {tx.comment && <p className="text-xs text-gray-500">{tx.comment}</p>}
                    <p className="text-xs text-gray-600">{new Date(tx.createdAt).toLocaleString('ru-RU')}</p>
                  </div>
                  <span className={`font-bold text-sm ${isPos ? 'text-casino-cyan' : 'text-red-400'}`}>
                    {isPos ? '+' : '-'}{Math.abs(tx.amountRub).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
