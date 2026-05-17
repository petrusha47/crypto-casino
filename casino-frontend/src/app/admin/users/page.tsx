'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import axios from 'axios'
import api from '@/lib/api'

interface AdminUser {
  id: string
  email: string
  username: string
  role: string
  balanceRub: number
  isBanned: boolean
  createdAt: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadUsers = useCallback(() => {
    const controller = new AbortController()
    setLoading(true)
    api.get<{ users: AdminUser[]; total: number; page: number; pageSize: number }>(
      `/api/admin/users?page=${page}&search=${encodeURIComponent(debouncedSearch)}`,
      { signal: controller.signal },
    )
      .then((r) => { setUsers(r.data.users); setTotal(r.data.total) })
      .catch((err) => { if (!axios.isCancel(err)) setError('Ошибка загрузки') })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [page, debouncedSearch])

  useEffect(() => { loadUsers() }, [loadUsers])

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Пользователи</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        className="input-field max-w-sm"
        placeholder="Поиск по email или username..."
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-casino-border">
              <th className="pb-3 pr-4">Пользователь</th>
              <th className="pb-3 pr-4">Email</th>
              <th className="pb-3 pr-4">Роль</th>
              <th className="pb-3 pr-4">Баланс</th>
              <th className="pb-3 pr-4">Статус</th>
              <th className="pb-3">Зарегистрирован</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">Загрузка...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Нет пользователей</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b border-casino-border hover:bg-white/5 cursor-pointer">
                <td className="py-3 pr-4">
                  <Link href={`/admin/users/${u.id}`} className="text-casino-cyan hover:underline font-medium">
                    {u.username}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-gray-400">{u.email}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    u.role === 'ADMIN' ? 'bg-red-900/30 text-red-400' :
                    u.role === 'SUPPORT' ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-gray-800 text-gray-400'
                  }`}>{u.role}</span>
                </td>
                <td className="py-3 pr-4 text-white">{u.balanceRub.toLocaleString('ru-RU')} ₽</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.isBanned ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
                    {u.isBanned ? 'Забанен' : 'Активен'}
                  </span>
                </td>
                <td className="py-3 text-gray-500 text-xs">{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-primary py-1 px-3 text-sm disabled:opacity-50"
          >
            ←
          </button>
          <span className="text-gray-400 text-sm">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-primary py-1 px-3 text-sm disabled:opacity-50"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
