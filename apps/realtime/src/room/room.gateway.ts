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
  RELAYS,
  type RelayClientToServerEvents,
  type RelayPeerUpdate,
  type RelayPlayerState,
  type RelayServerToClientEvents,
} from '../../../../shared/relay/contract'
import {
  createRelayPlayer,
  IDLE_MS,
  MAX_PLAYERS,
  readNumbers,
  receiveState,
  ROOM_CAPACITY,
  TICK_MS,
  type PositionRules,
  type RelayPlayer,
} from '../relay/relay'

/**
 * 방 단위 익명 중계 — 정원 20명 방에 같이 있는 사람끼리 본다. 지금은 플레이 씬(/play)이 쓴다.
 *
 * 원본(Summer Afternoon)처럼 로그인 없이 붙어 방 단위로 아이들의 위치·방향·모션·
 * 색 시드를 주고받는다. 원본 릴레이는 받은 메시지를 방 전원에게 곧장 흘리고 상태를
 * 들지 않았지만, 여기서는 서버가 방 사람들의 마지막 상태를 들고 있다가 방마다 35ms에
 * 한 번 바뀐 필드만 묶어 내린다. 새로 들어온 사람은 접속하자마자 방 전원의 현재
 * 상태를 받고, 값·속도·빈도 검증도 서버가 한다(relay.ts).
 *
 * 섹터 게이트웨이는 handleConnection에서 토큰을 직접 검사하고, 이 게이트웨이는 일부러
 * 검사하지 않는다. 주고받는 것은 씬 로컬 좌표와 모션뿐이라 개인정보가 없다.
 *
 * 상태는 이 프로세스 메모리에만 있다 — 인스턴스를 늘리면 인스턴스끼리는 서로 안 보인다.
 */

type RelayNamespace = Namespace<RelayClientToServerEvents, RelayServerToClientEvents>
type RelaySocket = Socket<RelayClientToServerEvents, RelayServerToClientEvents>

interface Player extends RelayPlayer {
  room: string
}

/** 좌표 한계 — 섬은 수백 m 안에 있다. 쓰레기 값만 거른다 */
const WORLD_LIMIT_M = 1000

const SCENE_LOCAL: PositionRules = {
  read: (value) => readNumbers(value, 3, WORLD_LIMIT_M, RELAYS.room.digits[0]) as RelayPlayerState['p'] | null,
  distance: (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
}

@WebSocketGateway({ namespace: RELAYS.room.namespace })
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() private server: RelayNamespace

  /** socket.id → 상태 */
  private readonly players = new Map<string, Player>()
  /** 방 → socket.id. 먼저 만든 방부터 채운다 */
  private readonly rooms = new Map<string, Set<string>>()
  private nextPlayerId = 0
  private nextRoomId = 0
  private timer?: NodeJS.Timeout

  afterInit() {
    this.timer = setInterval(() => this.flush(), TICK_MS)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  handleConnection(client: RelaySocket) {
    if (this.players.size >= MAX_PLAYERS) {
      client.disconnect(true)
      return
    }
    // 다시 붙는 클라이언트는 전에 있던 방을 청한다(원본 roomLast). 차 있으면 다른 방으로 간다
    const requested = client.handshake.auth?.room
    const room = this.pickRoom(typeof requested === 'string' ? requested : '')
    const player: Player = { ...createRelayPlayer((this.nextPlayerId++).toString(36), Date.now()), room }
    this.players.set(client.id, player)
    this.rooms.get(room)!.add(client.id)
    void client.join(room)

    client.emit('welcome', { id: player.id, room })
    const others: RelayPeerUpdate[] = []
    for (const socketId of this.rooms.get(room)!) {
      const other = this.players.get(socketId)
      if (other && other !== player && Object.keys(other.state).length > 0) {
        others.push({ id: other.id, ...other.state })
      }
    }
    if (others.length > 0) client.emit('states', others)
  }

  handleDisconnect(client: RelaySocket) {
    const player = this.players.get(client.id)
    if (!player) return
    this.players.delete(client.id)
    const members = this.rooms.get(player.room)
    members?.delete(client.id)
    if (members?.size === 0) this.rooms.delete(player.room)
    else this.server.to(player.room).emit('leave', player.id)
  }

  @SubscribeMessage('state')
  onState(@ConnectedSocket() client: RelaySocket, @MessageBody() body: unknown) {
    const player = this.players.get(client.id)
    if (player && !receiveState(player, body, Date.now(), SCENE_LOCAL)) client.disconnect(true)
  }

  /** 방마다 바뀐 필드를 한 묶음으로 방송하고, 오래 조용한 소켓을 정리한다 */
  private flush() {
    if (!this.server) return
    const now = Date.now()
    const idle: string[] = []
    for (const [room, members] of this.rooms) {
      const updates: RelayPeerUpdate[] = []
      for (const socketId of members) {
        const player = this.players.get(socketId)
        if (!player) continue
        if (now - player.lastMessageAt > IDLE_MS) idle.push(socketId)
        if (Object.keys(player.dirty).length === 0) continue
        updates.push({ id: player.id, ...player.dirty })
        player.dirty = {}
      }
      // 혼자 있는 방은 보낼 이유가 없다 — 다음 사람은 접속할 때 전체 상태를 받는다
      if (updates.length > 0 && members.size > 1) this.server.to(room).emit('states', updates)
    }
    for (const socketId of idle) this.server.sockets.get(socketId)?.disconnect(true)
  }

  /** 청한 방에 자리가 있으면 거기로, 아니면 먼저 만든 방부터 채우고, 다 차면 새 방을 연다 */
  private pickRoom(requested: string): string {
    const wanted = this.rooms.get(requested)
    if (wanted && wanted.size < ROOM_CAPACITY) return requested
    for (const [room, members] of this.rooms) {
      if (members.size < ROOM_CAPACITY) return room
    }
    const room = (this.nextRoomId++).toString(36)
    this.rooms.set(room, new Set())
    return room
  }

  /** 관측용 — 현재 접속 인원 */
  get playerCount(): number {
    return this.players.size
  }
}
