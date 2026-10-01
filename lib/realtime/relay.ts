'use client'

import { io, type Socket } from 'socket.io-client'
import {
  RELAYS,
  type RelayClientToServerEvents,
  type RelayPeerUpdate,
  type RelayPlayerState,
  type RelayServerToClientEvents,
  type RelayName,
  type RelayTalkEnd,
} from '@/shared/relay/contract'

/** 만남 대화 이벤트 받기 — 판정은 서버가 하고, 화면은 받은 대로 그린다 */
export interface RelayTalkHandlers {
  onInvited(from: string): void
  onInviteEnded(from: string): void
  onDeclined(to: string): void
  onStarted(peer: string): void
  onMessage(message: { from: string; text: string; mine: boolean }): void
  onEnded(reason: RelayTalkEnd): void
}

/** 만남 대화 보내기 — 소켓이 붙어 있을 때만 나간다 */
export interface RelayTalk {
  invite(to: string): void
  reply(from: string, accept: boolean): void
  send(text: string): void
  leave(): void
}

export interface RelayConnection {
  talk: RelayTalk
  dispose(): void
}

const NO_TALK: RelayTalk = { invite() {}, reply() {}, send() {}, leave() {} }

// 빈 문자열로 구워져도 기본값을 쓴다 — 빈 주소는 아래 new URL()에서 예외가 나 씬 전체가 멈춘다
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:9002'
/** 원본 updateRate — 35ms마다 바뀐 필드만 올린다 */
const SEND_MS = 35
/** 원본 inactiveDisconnect — 5분 동안 바뀐 게 없으면 끊고, 다시 바뀌거나 탭으로 돌아오면 붙는다 */
const INACTIVE_MS = 300_000
/** 서버가 끊으면(정원 초과·과다 전송) 30초 뒤 다시 청한다 */
const RETRY_MS = 30_000

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits
const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]'

/**
 * 익명 멀티플레이 연결 — 원본 MicroRealmConnection의 동작을 socket.io로 옮겼다.
 *
 * 로그인 없이 중계 네임스페이스(방 `/room` — 플레이 씬, 근접 `/proximity` — 내 주변)에 붙는다.
 * 내 상태는 35ms마다 read()로 읽어 바뀐 필드만 올리고(위치는 중계마다 정한 소수 자리,
 * 방향은 소수 둘째 자리로 반올림해 비교). 탭이 숨어도(창 최소화·다른 탭) 연결을 두어, 다른 사람에게 계속 보이고
 * 다른 사람의 상태도 계속 받는다 — 화면은 돌아왔을 때 이어서 그린다. 서버에 닿지 못하면 소켓이 뒤에서 재시도할 뿐
 * 씬은 혼자인 채로 돈다.
 *
 * 방에 (다시) 들어가거나 연결이 끊기면 onReset — 이전 캐릭터들을 지우고, 대화도 끝난다. 붙으면
 * 서버가 함께 보이는 사람들의 전체 상태를 먼저 보내 준다. 만남 대화(talk)가 오가는 동안은
 * 움직이지 않아도 활동으로 쳐서 5분 무변화로 끊지 않는다.
 */
export function connectRelay(
  handlers: {
    /** 지금 내 상태(위치는 중계의 좌표). 아직 캐릭터가 없으면 null */
    read: () => RelayPlayerState | null
    onReset: () => void
    onUpdate: (update: RelayPeerUpdate) => void
    onLeave: (id: string) => void
    talk?: RelayTalkHandlers
  },
  relay: RelayName = 'room',
): RelayConnection {
  // 소켓 주소 없이 빌드한 배포본(기본값 localhost)은 방문자 PC의 localhost로 붙으려 한다.
  // 공개 페이지에서 그러면 브라우저가 로컬 네트워크 접근 권한을 묻거나 재시도마다 오류를 남기므로 혼자 돈다
  if (isLoopback(new URL(WS_URL).hostname) && !isLoopback(location.hostname)) return { talk: NO_TALK, dispose() {} }

  let room = ''
  let selfId = ''
  let joined = false
  // 서버가 가진 내 상태 — 여기와 다른 필드만 보낸다
  let sent: Partial<RelayPlayerState> = {}
  let changedAt = Date.now()
  let inactive = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const { namespace, digits } = RELAYS[relay]
  const socket: Socket<RelayServerToClientEvents, RelayClientToServerEvents> = io(`${WS_URL}${namespace}`, {
    // 다시 붙을 때마다 전에 있던 방을 청한다(원본 roomLast)
    auth: (cb) => cb({ room }),
    transports: ['websocket'],
    reconnectionDelayMax: 10_000,
    autoConnect: false,
  })

  socket.on('welcome', (body) => {
    selfId = body.id
    room = body.room
    joined = true
    sent = {}
    changedAt = Date.now()
    handlers.onReset()
  })
  socket.on('states', (updates) => {
    for (const update of updates) if (update.id !== selfId) handlers.onUpdate(update)
  })
  socket.on('leave', handlers.onLeave)

  // 대화가 오가면 움직이지 않아도 사람이 있는 것으로 친다
  const active = () => {
    changedAt = Date.now()
  }
  const talk = handlers.talk
  if (talk) {
    socket.on('talkInvited', (from) => (active(), talk.onInvited(from)))
    socket.on('talkInviteEnded', (from) => talk.onInviteEnded(from))
    socket.on('talkDeclined', (to) => talk.onDeclined(to))
    socket.on('talkStarted', (peer) => (active(), talk.onStarted(peer)))
    socket.on('talkMessage', (message) => (active(), talk.onMessage({ ...message, mine: message.from === selfId })))
    socket.on('talkEnded', (reason) => talk.onEnded(reason))
  }

  socket.on('disconnect', (reason) => {
    joined = false
    handlers.onReset()
    // 서버가 끊은 경우 socket.io는 스스로 다시 붙지 않는다
    if (reason === 'io server disconnect') {
      clearTimeout(retry)
      retry = setTimeout(() => socket.connect(), RETRY_MS)
    }
  })

  const send = () => {
    const state = handlers.read()
    if (!state) return
    const next: RelayPlayerState = {
      p: [round(state.p[0], digits[0]), round(state.p[1], digits[1]), round(state.p[2], digits[2])],
      r: [round(state.r[0], 2), round(state.r[1], 2)],
      a: state.a,
      s: state.s,
    }
    const changes: Partial<RelayPlayerState> = {}
    let changed = false
    for (const key of Object.keys(next) as (keyof RelayPlayerState)[]) {
      if (JSON.stringify(next[key]) === JSON.stringify(sent[key])) continue
      ;(changes as Record<string, unknown>)[key] = next[key]
      changed = true
    }
    const now = Date.now()
    if (changed) changedAt = now
    if (joined && socket.connected) {
      if (changed) {
        socket.emit('state', changes)
        Object.assign(sent, changes)
      } else if (now - changedAt > INACTIVE_MS) {
        inactive = true
        socket.disconnect()
      }
    } else if (inactive && changed) {
      inactive = false
      socket.connect()
    }
  }
  const timer = setInterval(send, SEND_MS)

  // 오래 가만히 있어 끊긴 채 탭으로 돌아오면(사람이 돌아왔다) 움직이기 전이라도 바로 다시 붙는다
  const onVisibility = () => {
    if (document.hidden || !inactive) return
    inactive = false
    changedAt = Date.now()
    socket.connect()
  }
  document.addEventListener('visibilitychange', onVisibility)
  socket.connect()

  const live = () => joined && socket.connected
  return {
    talk: {
      invite(to) {
        if (!live()) return
        active()
        socket.emit('talkInvite', to)
      },
      reply(from, accept) {
        if (!live()) return
        active()
        socket.emit('talkReply', { from, accept })
      },
      send(text) {
        if (!live()) return
        active()
        socket.emit('talkSend', text)
      },
      leave() {
        if (live()) socket.emit('talkLeave')
      },
    },
    dispose() {
      clearInterval(timer)
      clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisibility)
      socket.off()
      socket.disconnect()
    },
  }
}
