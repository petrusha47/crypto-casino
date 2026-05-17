import RouletteTable from '@/components/games/roulette/RouletteTable'

export const metadata = { title: 'Рулетка — ZW Casino' }

export default function RoulettePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold neon-text-purple mb-8 text-center">🎡 РУЛЕТКА</h1>
      <RouletteTable />
    </div>
  )
}
