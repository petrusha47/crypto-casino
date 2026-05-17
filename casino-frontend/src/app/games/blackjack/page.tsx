import BlackjackTable from '@/components/games/blackjack/BlackjackTable'

export const metadata = { title: 'Блэкджек — ZW Casino' }

export default function BlackjackPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold neon-text-cyan mb-8 text-center">♠️ БЛЭКДЖЕК</h1>
      <BlackjackTable />
    </div>
  )
}
