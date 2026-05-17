'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

export default function AdminPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (user && user.role === 'USER') router.push('/')
  }, [user, router])

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold neon-text-purple mb-8 text-center">🔧 ADMIN PANEL</h1>
      <div className="card text-center text-gray-400 py-12">Административная панель — Plan 5</div>
    </div>
  )
}
