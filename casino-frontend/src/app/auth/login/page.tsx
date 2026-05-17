'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { User } from '@/types'

export default function LoginPage() {
  const router = useRouter()
  const { setAccessToken, setUser } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ accessToken: string; user: User }>('/api/auth/login', {
        email,
        password,
      })
      setAccessToken(res.data.accessToken)
      setUser(res.data.user)
      router.push('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="card">
        <h1 className="text-2xl font-bold neon-text-cyan mb-8 text-center tracking-widest">
          ВОЙТИ
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-field" placeholder="you@example.com" required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Пароль</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-field" placeholder="••••••••" required />
          </div>
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>
        <p className="text-center text-gray-400 text-sm mt-6">
          Нет аккаунта?{' '}
          <Link href="/auth/register" className="text-casino-cyan hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  )
}
