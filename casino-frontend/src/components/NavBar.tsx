'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import BalanceDisplay from './BalanceDisplay'
import api from '@/lib/api'

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, isAuthenticated } = useAuthStore()
  const authed = isAuthenticated()

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout') } catch {}
    logout()
    router.push('/auth/login')
  }

  const links = [
    { href: '/', label: 'Лобби' },
    { href: '/games/slots', label: 'Слоты' },
    { href: '/games/crash', label: 'Краш' },
    { href: '/games/roulette', label: 'Рулетка' },
    { href: '/games/blackjack', label: 'Блэкджек' },
    { href: '/games/poker', label: 'Покер' },
    { href: '/wallet', label: 'Кошелёк' },
  ]

  return (
    <nav className="border-b border-casino-border bg-casino-dark/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <Link href="/" className="text-xl font-bold tracking-widest neon-text-cyan">
          ZW CASINO
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                pathname === href
                  ? 'text-casino-cyan border border-casino-cyan/30 bg-casino-cyan/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <BalanceDisplay />
          {authed ? (
            <div className="flex items-center gap-2">
              {user?.role === 'ADMIN' && (
                <Link href="/admin" className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 font-medium transition-colors">
                  Admin
                </Link>
              )}
              <Link href="/profile" className="text-sm text-gray-400 hover:text-white">
                {user?.username}
              </Link>
              <button onClick={handleLogout} className="btn-danger text-sm py-1 px-3">
                Выйти
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Link href="/auth/login" className="btn-cyan text-sm py-1">Войти</Link>
              <Link href="/auth/register" className="btn-primary text-sm py-1">Регистрация</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
