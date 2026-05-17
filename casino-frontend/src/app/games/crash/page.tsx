import CrashGame from '@/components/games/crash/CrashGame'

export const metadata = { title: 'Краш — ZW Casino' }

export default function CrashPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold neon-text-cyan mb-8 text-center">📈 КРАШ</h1>
      <CrashGame />
    </div>
  )
}
