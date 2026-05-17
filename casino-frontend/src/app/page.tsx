import Link from 'next/link'

const GAMES = [
  {
    href: '/games/slots',
    name: 'Слоты',
    icon: '🎰',
    desc: '5 барабанов, 20 линий',
    edge: 'RTP 96%',
  },
  {
    href: '/games/crash',
    name: 'Краш',
    icon: '📈',
    desc: 'Мультиплеер, кешаут в реальном времени',
    edge: 'House edge 3%',
  },
  {
    href: '/games/poker',
    name: 'Покер',
    icon: '🃏',
    desc: "Texas Hold'em, до 6 игроков",
    edge: 'Rake 5%',
  },
  {
    href: '/games/roulette',
    name: 'Рулетка',
    icon: '🎡',
    desc: 'Европейская, 37 секторов',
    edge: 'House edge 2.7%',
  },
  {
    href: '/games/blackjack',
    name: 'Блэкджек',
    icon: '♠️',
    desc: '6 колод, Hit/Stand/Double/Split',
    edge: 'House edge 0.5%',
  },
]

export default function LobbyPage() {
  return (
    <div>
      <div className="text-center py-12 mb-12">
        <h1 className="text-5xl font-bold tracking-widest mb-4 neon-text-cyan">
          ZW CASINO
        </h1>
        <p className="text-gray-400 text-lg">
          Криптоказино с депозитами через USDT TRC20. Провабли-фэйр.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {GAMES.map((game) => (
          <Link
            key={game.href}
            href={game.href}
            className="card group hover:border-casino-purple hover:shadow-glow-sm-purple transition-all duration-300 cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-4xl">{game.icon}</span>
              <span className="text-xs text-gray-500 bg-casino-bg px-2 py-1 rounded">
                {game.edge}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2 group-hover:text-casino-cyan transition-colors">
              {game.name}
            </h2>
            <p className="text-gray-400 text-sm">{game.desc}</p>
            <div className="mt-4">
              <span className="btn-primary text-sm py-1.5 px-4 inline-block">
                Играть
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
