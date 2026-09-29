'use client'

import { io, type Socket } from 'socket.io-client'
import {
  SCENE_WORLDS,
  type SceneClientToServerEvents,
  type ScenePeerUpdate,
  type ScenePlayerState,
  type SceneServerToClientEvents,
  type SceneWorld,
} from '@/shared/scene/contract'

export interface SceneConnection {
  dispose(): void
}

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
 * 로그인 없이 월드 네임스페이스(여름 마을 `/scene`, 내 주변 `/neighborhood`)에 붙는다.
 * 내 상태는 35ms마다 read()로 읽어 바뀐 필드만 올리고(위치는 월드마다 정한 소수 자리,
 * 방향은 소수 둘째 자리로 반올림해 비교). 탭이 숨어도(창 최소화·다른 탭) 연결을 두어, 다른 사람에게 계속 보이고
 * 다른 사람의 상태도 계속 받는다 — 화면은 돌아왔을 때 이어서 그린다. 서버에 닿지 못하면 소켓이 뒤에서 재시도할 뿐
 * 씬은 혼자인 채로 돈다.
 *
 * 방에 (다시) 들어가거나 연결이 끊기면 onReset — 이전 아이들을 지운다. 붙으면 서버가
 * 함께 보이는 사람들의 전체 상태를 먼저 보내 준다.
 */
export function connectScene(
  handlers: {
    /** 지금 내 상태(위치는 월드의 좌표). 아직 캐릭터가 없으면 null */
    read: () => ScenePlayerState | null
    onReset: () => void
    onUpdate: (update: ScenePeerUpdate) => void
    onLeave: (id: string) => void
  },
  world: SceneWorld = 'island',
): SceneConnection {
  // 소켓 주소 없이 빌드한 배포본(기본값 localhost)은 방문자 PC의 localhost로 붙으려 한다.
  // 공개 페이지에서 그러면 브라우저가 로컬 네트워크 접근 권한을 묻거나 재시도마다 오류를 남기므로 혼자 돈다
  if (isLoopback(new URL(WS_URL).hostname) && !isLoopback(location.hostname)) return { dispose() {} }

  let room = ''
  let selfId = ''
  let joined = false
  // 서버가 가진 내 상태 — 여기와 다른 필드만 보낸다
  let sent: Partial<ScenePlayerState> = {}
  let changedAt = Date.now()
  let inactive = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const { namespace, digits } = SCENE_WORLDS[world]
  const socket: Socket<SceneServerToClientEvents, SceneClientToServerEvents> = io(`${WS_URL}${namespace}`, {
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
    const next: ScenePlayerState = {
      p: [round(state.p[0], digits[0]), round(state.p[1], digits[1]), round(state.p[2], digits[2])],
      r: [round(state.r[0], 2), round(state.r[1], 2)],
      a: state.a,
      s: state.s,
    }
    const changes: Partial<ScenePlayerState> = {}
    let changed = false
    for (const key of Object.keys(next) as (keyof ScenePlayerState)[]) {
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

  return {
    dispose() {
      clearInterval(timer)
      clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisibility)
      socket.off()
      socket.disconnect()
    },
  }
}
