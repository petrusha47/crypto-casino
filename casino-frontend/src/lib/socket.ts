import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(token: string): Socket {
  if (socket && socket.connected) return socket
  if (socket) socket.disconnect()

  socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'https://crypto-casino-production.up.railway.app', {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  })

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
