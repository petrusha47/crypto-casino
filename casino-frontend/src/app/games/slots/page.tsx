import SlotMachine from '@/components/games/slots/SlotMachine'

export const metadata = { title: 'Слоты — ZW Casino' }

export default function SlotsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold neon-text-purple mb-8 text-center">🎰 СЛОТЫ</h1>
      <SlotMachine />
    </div>
  )
}
