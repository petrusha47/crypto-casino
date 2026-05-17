import PokerTable from '@/components/games/poker/PokerTable'

export default async function PokerTablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div>
      <h1 className="text-3xl font-bold neon-text-purple mb-8 text-center">🃏 ПОКЕР</h1>
      <PokerTable tableId={id} />
    </div>
  )
}
