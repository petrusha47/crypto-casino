'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

const NAV = [
  { href: '/admin', label: 'Дашборд' },
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/withdrawals', label: 'Выводы' },
  { href: '/admin/tables', label: 'Столы' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const pathname = usePathname()

  if (!user || user.role === 'USER') return null

  return (
    <div className="flex min-h-screen">
      <aside className="w-48 flex-shrink-0 border-r border-casino-border bg-casino-dark p-4 flex flex-col gap-1">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-4">Admin</p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded text-sm transition-colors ${
              pathname === item.href
                ? 'text-casino-cyan bg-casino-cyan/10'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-auto pt-4 border-t border-casino-border">
          <Link href="/" className="block px-3 py-2 text-xs text-gray-600 hover:text-gray-400">
            ← На сайт
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
