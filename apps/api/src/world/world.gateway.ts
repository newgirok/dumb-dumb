import { Logger, OnModuleDestroy } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import { AuthService } from '../auth/auth.service'
import { distanceM, isPlausibleMove, requiredSectors } from './sector'

/**
 * 위치 브로드캐스트 서버.
 *
 * Supabase Realtime을 쓰던 구조는 유저마다 자기 위치를 직접 쏘는 방식이라
 * 메시지 수가 유저 수에 비례해 폭증했다(10Hz × 인원). 여기서는 서버가
 * 좌표를 모아뒀다가 섹터마다 200ms에 한 번 "이 섹터 사람들 전체"를 한 묶음
 * 으로 방송한다. 100명이 있어도 섹터당 초당 5건이다.
 *
 * 검증도 서버로 옮겼다. 예전엔 클라이언트가 스스로 속도를 검사했는데,
 * 그건 고쳐 쓰면 그만이다.
 */

interface PlayerState {
  userId: string
  nickname: string
  lng: number
  lat: number
  ts: number
  sectors: string[]
}

const TICK_MS = 200
/** 이 시간 동안 갱신이 없으면 접속이 끊긴 것으로 보고 정리 */
const STALE_MS = 30_000

@WebSocketGateway({
  namespace: '/world',
  cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class WorldGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() private server: Server
  private readonly logger = new Logger(WorldGateway.name)

  /** socket.id → 상태 */
  private readonly players = new Map<string, PlayerState>()
  private timer?: NodeJS.Timeout

  constructor(private readonly auth: AuthService) {}

  afterInit() {
    this.timer = setInterval(() => this.flush(), TICK_MS)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  handleConnection(client: Socket) {
    // 토큰은 handshake.auth 로 받는다. 쿼리스트링에 담으면 접속 로그에 남는다
    const token = client.handshake.auth?.token as string | undefined
    if (!token) {
      client.disconnect(true)
      return
    }
    try {
      const payload = this.auth.verifyToken(token, 'access')
      client.data.userId = payload.sub
      client.data.email = payload.email
    } catch {
      client.disconnect(true)
    }
  }

  handleDisconnect(client: Socket) {
    this.players.delete(client.id)
  }

  @SubscribeMessage('move')
  onMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lng?: number; lat?: number; nickname?: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) return
    const { lng, lat } = body ?? {}
    if (typeof lng !== 'number' || typeof lat !== 'number') return
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

    const now = Date.now()
    const prev = this.players.get(client.id)
    if (!isPlausibleMove(prev, { lng, lat, ts: now })) return

    const sectors = requiredSectors(lng, lat)

    // 섹터가 바뀌었으면 방을 갈아탄다
    if (!prev || prev.sectors.join() !== sectors.join()) {
      for (const room of prev?.sectors ?? []) {
        if (!sectors.includes(room)) void client.leave(room)
      }
      for (const room of sectors) {
        if (!prev?.sectors.includes(room)) void client.join(room)
      }
    }

    this.players.set(client.id, {
      userId,
      nickname: typeof body.nickname === 'string' ? body.nickname.slice(0, 32) : '',
      lng,
      lat,
      ts: now,
      sectors,
    })
  }

  @SubscribeMessage('chat')
  onChat(@ConnectedSocket() client: Socket, @MessageBody() body: { text?: string }) {
    const userId = client.data.userId as string | undefined
    const state = this.players.get(client.id)
    if (!userId || !state) return
    const text = (body?.text ?? '').trim().slice(0, 200)
    if (!text) return

    // 채팅은 빈도가 낮으니 묶지 않고 바로 흘린다
    for (const room of state.sectors) {
      this.server.to(room).emit('chat', { userId, nickname: state.nickname, text })
    }
  }

  /** 섹터마다 한 묶음으로 방송 */
  private flush() {
    if (!this.server) return
    const cutoff = Date.now() - STALE_MS

    const bySector = new Map<string, { userId: string; lng: number; lat: number }[]>()
    for (const [socketId, p] of this.players) {
      if (p.ts < cutoff) {
        this.players.delete(socketId)
        continue
      }
      for (const sector of p.sectors) {
        const list = bySector.get(sector) ?? []
        list.push({ userId: p.userId, lng: p.lng, lat: p.lat })
        bySector.set(sector, list)
      }
    }

    for (const [sector, positions] of bySector) {
      // 혼자 있는 섹터는 보낼 이유가 없다
      if (positions.length < 2) continue
      this.server.to(sector).emit('positions', positions)
    }
  }

  /** 관측용 — 현재 접속 인원 */
  get playerCount(): number {
    return this.players.size
  }
}

export { distanceM }
