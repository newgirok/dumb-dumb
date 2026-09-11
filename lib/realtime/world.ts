'use client'

import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from '@/lib/auth/session'

export interface PeerPosition {
  userId: string
  lng: number
  lat: number
}

export interface ChatMessage {
  userId: string
  nickname: string
  text: string
}

export interface WorldConnection {
  /** 내 위치를 서버에 알린다. 섹터 판정·검증은 서버가 한다 */
  move(lng: number, lat: number, nickname?: string): void
  chat(text: string): void
  disconnect(): void
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:9001'

/**
 * 위치·채팅 연결.
 *
 * 예전에는 Supabase Realtime 채널을 섹터마다 클라이언트가 직접 구독하고
 * 자기 위치를 전원에게 뿌렸다. 이제는 서버가 좌표를 모아 섹터당 한 묶음으로
 * 내려주므로, 클라이언트는 소켓 하나만 들고 있으면 된다.
 *
 * positions 는 섹터마다 오므로 경계에서는 한 틱에 두 번 올 수 있다.
 * userId 로 합쳐서 처리해야 중복이 생기지 않는다.
 */
export function connectWorld(handlers: {
  onPositions: (positions: PeerPosition[]) => void
  onChat?: (msg: ChatMessage) => void
}): WorldConnection {
  const socket: Socket = io(`${WS_URL}/world`, {
    auth: { token: getAccessToken() },
    transports: ['websocket'],
  })

  socket.on('positions', handlers.onPositions)
  if (handlers.onChat) socket.on('chat', handlers.onChat)

  return {
    move(lng, lat, nickname) {
      if (socket.connected) socket.emit('move', { lng, lat, nickname })
    },
    chat(text) {
      if (socket.connected) socket.emit('chat', { text })
    },
    disconnect() {
      socket.close()
    },
  }
}
