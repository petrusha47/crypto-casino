import { Server as SocketServer } from 'socket.io'
import { Server as HttpServer } from 'http'
import { verifyAccessToken } from '../services/auth.service'
import { env } from '../config/env'

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  })

  // Client must pass token in handshake auth: socket.io({ auth: { token: '...' } })
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('Authentication required'))
    try {
      socket.data.user = verifyAccessToken(token)
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  return io
}
