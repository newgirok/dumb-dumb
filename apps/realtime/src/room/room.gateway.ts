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
  countMessage,
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
import { Talks } from '../relay/talk'

/**
 * 방 단위 익명 중계 — 정원 20명 방에 같이 있는 사람끼리 본다. 지금은 플레이 씬(/play)이 쓴다.
 *
 * 원본(Summer Afternoon)처럼 로그인 없이 붙어 방 단위로 캐릭터들의 위치·방향·모션·
 * 색 시드를 주고받는다. 원본 릴레이는 받은 메시지를 방 전원에게 곧장 흘리고 상태를
 * 들지 않았지만, 여기서는 서버가 방 사람들의 마지막 상태를 들고 있다가 방마다 35ms에
 * 한 번 바뀐 필드만 묶어 내린다. 새로 들어온 사람은 접속하자마자 방 전원의 현재
 * 상태를 받고, 값·속도·빈도 검증도 서버가 한다(relay.ts). 같은 방 30m 안의 사람끼리는
 * 만남 대화(talk.ts)를 나눌 수 있다.
 *
 * 섹터 게이트웨이는 handleConnection에서 토큰을 직접 검사하고, 이 게이트웨이는 일부러
 * 검사하지 않는다. 주고받는 것은 씬 로컬 좌표·모션과 저장하지 않는 대화 글뿐이고,
 * 이름·기기 정보는 싣지 않는다.
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
  /** 중계 id → socket.id — 대화 이벤트를 한 사람에게 보낼 때 쓴다 */
  private readonly sockets = new Map<string, string>()
  /** 방 → socket.id. 먼저 만든 방부터 채운다 */
  private readonly rooms = new Map<string, Set<string>>()
  private nextPlayerId = 0
  private nextRoomId = 0
  private timer?: NodeJS.Timeout

  /** 만남 대화 — 같은 방 사람끼리만 닿는다 */
  private readonly talks = new Talks<Player>({
    find: (id) => {
      const socketId = this.sockets.get(id)
      return socketId ? this.players.get(socketId) : undefined
    },
    distance: (a, b) =>
      a.room === b.room && a.state.p && b.state.p ? SCENE_LOCAL.distance(a.state.p, b.state.p) : Infinity,
    emit: (to, event, ...args) => {
      const socketId = this.sockets.get(to.id)
      const socket = socketId ? this.server.sockets.get(socketId) : undefined
      ;(socket?.emit as ((event: string, ...args: unknown[]) => boolean) | undefined)?.call(socket, event, ...args)
    },
    touch: (p, now) => {
      p.lastMessageAt = now
    },
  })

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
    this.sockets.set(player.id, client.id)
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
    this.talks.drop(player.id, Date.now())
    this.sockets.delete(player.id)
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

  @SubscribeMessage('talkInvite')
  onTalkInvite(@ConnectedSocket() client: RelaySocket, @MessageBody() to: unknown) {
    const player = this.talker(client)
    if (player) this.talks.invite(player, to, Date.now())
  }

  @SubscribeMessage('talkReply')
  onTalkReply(@ConnectedSocket() client: RelaySocket, @MessageBody() body: unknown) {
    const player = this.talker(client)
    if (player) this.talks.reply(player, body, Date.now())
  }

  @SubscribeMessage('talkSend')
  onTalkSend(@ConnectedSocket() client: RelaySocket, @MessageBody() text: unknown) {
    const player = this.talker(client)
    if (player) this.talks.send(player, text, Date.now())
  }

  @SubscribeMessage('talkLeave')
  onTalkLeave(@ConnectedSocket() client: RelaySocket) {
    const player = this.talker(client)
    if (player) this.talks.leave(player)
  }

  /** 대화 이벤트도 상태와 같은 초당 한도로 센다 — 넘으면 끊는다 */
  private talker(client: RelaySocket): Player | undefined {
    const player = this.players.get(client.id)
    if (!player) return undefined
    if (countMessage(player, Date.now())) return player
    client.disconnect(true)
    return undefined
  }

  /** 방마다 바뀐 필드를 한 묶음으로 방송하고, 대화를 판정하고, 오래 조용한 소켓을 정리한다 */
  private flush() {
    if (!this.server) return
    const now = Date.now()
    this.talks.tick(now)
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
