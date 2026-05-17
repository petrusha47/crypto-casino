'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { User } from '@/types'

export default function RegisterPage() {
  const router = useRouter()
  const { setAccessToken, setUser } = useAuthStore()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ accessToken: string; user: User }>('/api/auth/register', {
        email,
        username,
        password,
      })
      setAccessToken(res.data.accessToken)
      setUser(res.data.user)
      router.push('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="card">
        <h1 className="text-2xl font-bold neon-text-cyan mb-8 text-center tracking-widest">
          РЕГИСТРАЦИЯ
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-field" placeholder="you@example.com" required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Никнейм</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="input-field" placeholder="coolplayer" required minLength={3} maxLength={20} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Пароль</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-field" placeholder="Мин. 8 символов" required minLength={8} />
          </div>
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? 'Регистрируемся...' : 'Создать аккаунт'}
          </button>
        </form>
        <p className="text-center text-gray-400 text-sm mt-6">
          Уже есть аккаунт?{' '}
          <Link href="/auth/login" className="text-casino-cyan hover:underline">Войти</Link>
        </p>
      </div>
    </div>
  )
}
