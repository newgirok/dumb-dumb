import { OnModuleDestroy } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { Namespace, Socket } from 'socket.io'
import {
  SCENE_WORLDS,
  type SceneClientToServerEvents,
  type ScenePeerUpdate,
  type ScenePlayerState,
  type SceneServerToClientEvents,
} from '../../../../shared/scene/contract'
import {
  createRelayPlayer,
  IDLE_MS,
  MAX_PLAYERS,
  receiveState,
  ROOM_CAPACITY,
  TICK_MS,
  type PositionRules,
  type RelayPlayer,
} from './relay'

/**
 * 내 동네 익명 멀티플레이 릴레이 — 실제 좌표로 주고받고, 저마다 가까운 사람만 본다.
 *
 * 내 동네는 사람마다 선 동네가 달라 씬 원점도 저마다 다르다. 그래서 위치를 경위도로
 * 주고받고, 방을 나누는 대신 사람마다 반경 200m 안에서 가까운 19명을 골라 보여 준다
 * (여름 마을 방 정원 20명과 같다). 걸어가면 경계 없이 보이는 사람이 바뀌고, 새로 보이는
 * 사람은 전체 상태를, 계속 보이는 사람은 바뀐 필드만, 멀어진 사람은 leave를 받는다.
 *
 * 같은 동네 사람에게 내 실제 위치가 보이는 것이 이 기능의 목적이다. 로그인·이름 없이
 * 아이 모습만 보인다. 검증(빈도·속도·순간이동)은 여름 마을과 같다(relay.ts).
 *
 * 상태는 이 프로세스 메모리에만 있다 — 인스턴스를 늘리면 인스턴스끼리는 서로 안 보인다.
 */

type SceneNamespace = Namespace<SceneClientToServerEvents, SceneServerToClientEvents>
type SceneSocket = Socket<SceneClientToServerEvents, SceneServerToClientEvents>

interface Neighbor extends RelayPlayer {
  socket: SceneSocket
  /** 지금 이 사람에게 보이는 사람들 */
  seen: Set<Neighbor>
}

/** 이 안에 들어오면 보이고(카메라가 175m까지 그린다), 이보다 멀어지면 사라진다 */
const VIEW_M = 200
const HYSTERESIS_M = 30
const MAX_PEERS = ROOM_CAPACITY - 1
/** 사람을 담는 격자 한 칸 — 사라지는 거리보다 커서 둘레 3×3칸만 보면 된다 */
const CELL_M = 250

/** 경위도 1°의 길이(m) — 웹의 lib/geo/localFrame과 같은 근사(동네 안에서는 1m 안쪽으로 맞는다) */
const M_PER_DEG_LAT = 110_574
const M_PER_DEG_LNG = 111_320
const CELL_LAT = CELL_M / M_PER_DEG_LAT
/** 칸의 경도 폭은 줄(위도 띠)마다 정한다 — 같은 줄에 있는 사람은 늘 같은 폭으로 나뉜다 */
const cellLng = (row: number) => CELL_M / (M_PER_DEG_LNG * Math.cos(((row + 0.5) * CELL_LAT * Math.PI) / 180))

const [LNG_DIGITS, LAT_DIGITS, Y_DIGITS] = SCENE_WORLDS.neighborhood.digits
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const REAL_WORLD: PositionRules = {
  read(value) {
    if (!Array.isArray(value) || value.length !== 3) return null
    const [lng, lat, y] = value as unknown[]
    if (!finite(lng) || !finite(lat) || !finite(y)) return null
    if (Math.abs(lng) > 180 || Math.abs(lat) > 85 || Math.abs(y) > 1000) return null
    return [round(lng, LNG_DIGITS), round(lat, LAT_DIGITS), round(y, Y_DIGITS)]
  },
  distance: metersBetween,
}

function metersBetween(a: ScenePlayerState['p'], b: ScenePlayerState['p']): number {
  const kx = M_PER_DEG_LNG * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * M_PER_DEG_LAT, b[2] - a[2])
}

@WebSocketGateway({
  namespace: SCENE_WORLDS.neighborhood.namespace,
  cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class NeighborhoodGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() private server: SceneNamespace

  /** socket.id → 상태 */
  private readonly players = new Map<string, Neighbor>()
  private nextPlayerId = 0
  private timer?: NodeJS.Timeout

  afterInit() {
    this.timer = setInterval(() => this.flush(), TICK_MS)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  handleConnection(client: SceneSocket) {
    if (this.players.size >= MAX_PLAYERS) {
      client.disconnect(true)
      return
    }
    const player: Neighbor = {
      ...createRelayPlayer((this.nextPlayerId++).toString(36), Date.now()),
      socket: client,
      seen: new Set(),
    }
    this.players.set(client.id, player)
    // 보이는 사람은 첫 위치를 받은 다음 틱부터 전체 상태로 내려간다
    client.emit('welcome', { id: player.id, room: '' })
  }

  handleDisconnect(client: SceneSocket) {
    const player = this.players.get(client.id)
    if (!player) return
    this.players.delete(client.id)
    for (const other of this.players.values()) {
      if (other.seen.delete(player)) other.socket.emit('leave', player.id)
    }
  }

  @SubscribeMessage('state')
  onState(@ConnectedSocket() client: SceneSocket, @MessageBody() body: unknown) {
    const player = this.players.get(client.id)
    if (player && !receiveState(player, body, Date.now(), REAL_WORLD)) client.disconnect(true)
  }

  /** 사람마다 볼 사람을 다시 고르고, 새로 보이면 전체 상태·계속 보이면 바뀐 필드·멀어지면 leave */
  private flush() {
    if (!this.server) return
    const now = Date.now()
    const cells = new Map<string, Neighbor[]>()
    for (const player of this.players.values()) {
      const p = player.state.p
      if (!p) continue
      const row = Math.floor(p[1] / CELL_LAT)
      const key = `${row},${Math.floor(p[0] / cellLng(row))}`
      const list = cells.get(key)
      if (list) list.push(player)
      else cells.set(key, [player])
    }

    const idle: Neighbor[] = []
    for (const viewer of this.players.values()) {
      if (now - viewer.lastMessageAt > IDLE_MS) idle.push(viewer)
      const next = this.pick(viewer, cells)
      for (const other of viewer.seen) if (!next.has(other)) viewer.socket.emit('leave', other.id)
      const updates: ScenePeerUpdate[] = []
      for (const other of next) {
        if (!viewer.seen.has(other)) updates.push({ id: other.id, ...other.state })
        else if (Object.keys(other.dirty).length > 0) updates.push({ id: other.id, ...other.dirty })
      }
      viewer.seen = next
      if (updates.length > 0) viewer.socket.emit('states', updates)
    }
    // 모두에게 나눠 준 뒤에 비운다
    for (const player of this.players.values()) player.dirty = {}
    for (const player of idle) player.socket.disconnect(true)
  }

  /**
   * 반경 안에서 가까운 순으로 19명. 이미 보이던 사람은 30m 더 멀어져야 빠지고 순위도 30m만큼
   * 앞으로 쳐 준다 — 경계에 선 사람이 매 틱 나타났다 사라지지 않게.
   */
  private pick(viewer: Neighbor, cells: Map<string, Neighbor[]>): Set<Neighbor> {
    const p = viewer.state.p
    if (!p) return new Set()
    const candidates: { other: Neighbor; score: number }[] = []
    const row0 = Math.floor(p[1] / CELL_LAT)
    for (let row = row0 - 1; row <= row0 + 1; row++) {
      const col0 = Math.floor(p[0] / cellLng(row))
      for (let col = col0 - 1; col <= col0 + 1; col++) {
        for (const other of cells.get(`${row},${col}`) ?? []) {
          if (other === viewer) continue
          const seen = viewer.seen.has(other)
          const d = metersBetween(p, other.state.p!)
          if (d > VIEW_M + (seen ? HYSTERESIS_M : 0)) continue
          candidates.push({ other, score: seen ? d - HYSTERESIS_M : d })
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score)
    return new Set(candidates.slice(0, MAX_PEERS).map((c) => c.other))
  }

  /** 관측용 — 현재 접속 인원 */
  get playerCount(): number {
    return this.players.size
  }
}
