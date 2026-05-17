'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'

interface PokerTable {
  id: string
  name: string
  minBetRub: number
  maxBetRub: number
  maxPlayers: number
  rake: number
  status: string
}

interface TableForm {
  name: string
  minBetRub: string
  maxBetRub: string
  maxPlayers: string
  rake: string
}

const EMPTY_FORM: TableForm = { name: '', minBetRub: '', maxBetRub: '', maxPlayers: '6', rake: '5' }

const STATUS_COLOR: Record<string, string> = {
  WAITING: 'text-yellow-400 bg-yellow-900/30',
  ACTIVE: 'text-green-400 bg-green-900/30',
  FINISHED: 'text-gray-400 bg-gray-800',
}
const STATUS_LABEL: Record<string, string> = { WAITING: 'Ожидание', ACTIVE: 'Активный', FINISHED: 'Закончен' }

export default function AdminTablesPage() {
  const [tables, setTables] = useState<PokerTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<TableForm>(EMPTY_FORM)

  const load = () => {
    api.get<{ tables: PokerTable[] }>('/api/admin/tables')
      .then((r) => setTables(r.data.tables))
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing('new'); setForm(EMPTY_FORM); setFormError('') }

  const openEdit = (t: PokerTable) => {
    setEditing(t.id)
    setForm({
      name: t.name,
      minBetRub: String(t.minBetRub),
      maxBetRub: String(t.maxBetRub),
      maxPlayers: String(t.maxPlayers),
      rake: String(t.rake * 100),
    })
    setFormError('')
  }

  const closeForm = () => { setEditing(null); setFormError('') }

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const payload = {
      name: form.name,
      minBetRub: Number(form.minBetRub),
      maxBetRub: Number(form.maxBetRub),
      maxPlayers: Number(form.maxPlayers),
      rake: Number(form.rake) / 100,
    }

    try {
      if (editing === 'new') {
        await api.post('/api/admin/tables', payload)
      } else {
        await api.patch(`/api/admin/tables/${editing}`, payload)
      }
      closeForm()
      load()
    } catch (err) {
      if (axios.isAxiosError(err)) setFormError(err.response?.data?.error ?? 'Ошибка')
    }
  }

  const deleteTable = async (id: string, name: string) => {
    if (typeof window !== 'undefined' && !confirm(`Удалить стол "${name}"?`)) return
    try {
      await api.delete(`/api/admin/tables/${id}`)
      load()
    } catch {
      setError('Ошибка удаления')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Покерные столы</h1>
        <button onClick={openCreate} className="btn-primary py-2 px-4 text-sm">+ Создать стол</button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {editing && (
        <div className="card">
          <h2 className="text-lg font-bold text-white mb-4">{editing === 'new' ? 'Новый стол' : 'Редактировать стол'}</h2>
          <form onSubmit={submitForm} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Название</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field w-full" placeholder="VIP стол" required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Мин. ставка (₽)</label>
              <input type="number" value={form.minBetRub} onChange={(e) => setForm({ ...form, minBetRub: e.target.value })}
                className="input-field w-full" placeholder="100" min={1} required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Макс. ставка (₽)</label>
              <input type="number" value={form.maxBetRub} onChange={(e) => setForm({ ...form, maxBetRub: e.target.value })}
                className="input-field w-full" placeholder="10000" min={1} required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Макс. игроков (2-9)</label>
              <input type="number" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: e.target.value })}
                className="input-field w-full" min={2} max={9} required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Рейк (%)</label>
              <input type="number" value={form.rake} onChange={(e) => setForm({ ...form, rake: e.target.value })}
                className="input-field w-full" placeholder="5" min={0} max={10} step={0.5} required />
            </div>
            {formError && <p className="col-span-2 text-red-400 text-sm">{formError}</p>}
            <div className="col-span-2 flex gap-3">
              <button type="submit" className="btn-primary px-6">{editing === 'new' ? 'Создать' : 'Сохранить'}</button>
              <button type="button" onClick={closeForm} className="border border-casino-border text-gray-400 rounded px-4 py-2 hover:text-white transition-colors">
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-casino-border">
              <th className="pb-3 pr-4">Название</th>
              <th className="pb-3 pr-4">Ставки</th>
              <th className="pb-3 pr-4">Игроков</th>
              <th className="pb-3 pr-4">Рейк</th>
              <th className="pb-3 pr-4">Статус</th>
              <th className="pb-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">Загрузка...</td></tr>
            ) : tables.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Нет столов</td></tr>
            ) : tables.map((t) => (
              <tr key={t.id} className="border-b border-casino-border">
                <td className="py-3 pr-4 font-medium text-white">{t.name}</td>
                <td className="py-3 pr-4 text-gray-400">
                  {t.minBetRub.toLocaleString('ru-RU')} – {t.maxBetRub.toLocaleString('ru-RU')} ₽
                </td>
                <td className="py-3 pr-4 text-gray-400">{t.maxPlayers}</td>
                <td className="py-3 pr-4 text-gray-400">{(t.rake * 100).toFixed(1)}%</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[t.status] ?? 'text-gray-400 bg-gray-800'}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(t)} className="text-xs text-casino-cyan hover:underline">Изменить</button>
                    <button onClick={() => deleteTable(t.id, t.name)} className="text-xs text-red-400 hover:underline">Удалить</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
