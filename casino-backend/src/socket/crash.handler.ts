import { Server, Socket } from 'socket.io'
import { startCrashGame, placeCrashBet, cashoutCrash } from '../services/crash.service'
import { redis } from '../config/redis'

export function registerCrashHandler(io: Server): void {
  if (process.env.NODE_ENV !== 'test') {
    startCrashGame(io)
  }

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user?.userId as string | undefined
    if (!userId) return

    sendCurrentState(socket)

    socket.on('crash:bet', async ({ betRub }: { betRub: number }) => {
      if (!betRub || typeof betRub !== 'number' || betRub <= 0) {
        socket.emit('crash:error', { message: 'Invalid bet amount' })
        return
      }
      const result = await placeCrashBet(io, userId, betRub)
      if (result.error) socket.emit('crash:error', { message: result.error })
    })

    socket.on('crash:cashout', async () => {
      const result = await cashoutCrash(userId)
      if (result.error) {
        socket.emit('crash:error', { message: result.error })
      } else {
        socket.emit('crash:cashout_confirmed', result)
        io.emit('crash:player_cashed_out', { userId, multiplier: result.multiplier })
      }
    })
  })
}

async function sendCurrentState(socket: Socket): Promise<void> {
  const phase = await redis.get('crash:phase')
  const roundId = await redis.get('crash:round_id')
  socket.emit('crash:state', { phase: phase ?? 'idle', roundId })
}
