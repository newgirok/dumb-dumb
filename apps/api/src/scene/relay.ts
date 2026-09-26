import type { ScenePlayerState } from '../../../../shared/scene/contract'

/**
 * 두 익명 릴레이(여름 마을 /scene · 내 동네 /neighborhood)가 함께 쓰는 상태 관리와 검증.
 * 서버가 사람마다 마지막 상태를 들고, 바뀐 필드를 모았다가 틱마다 내려보낸다.
 */

/** 원본 updateRate — 35ms에 한 번 묶어 보낸다 */
export const TICK_MS = 35
/** 한 사람이 함께 보는 인원(나 포함) — 여름 마을은 방 정원, 내 동네는 나 + 가까운 19명 */
export const ROOM_CAPACITY = 20
export const MAX_PLAYERS = 1000
/** 클라이언트는 5분 동안 바뀐 게 없으면 스스로 끊는다. 그보다 30초 더 조용하면 서버가 끊는다 */
export const IDLE_MS = 330_000
/** 정상 클라이언트는 35ms 간격(초당 약 29건)이다. 두 배를 넘기면 끊는다 */
const MAX_MESSAGES_PER_SEC = 60
/**
 * 이동 속도 — 달리기 약 3.5m/s, 낙하 종단 속도 약 7m/s. 초당 10m씩 차는 거리
 * 예산을 두고(최대 2m) 이동 거리만큼 쓴다. 패킷이 몰려 와도 합이 예산 안이면 받는다.
 */
const MAX_SPEED_MS = 10
const BURST_M = 2
/** 예산을 넘는 순간이동(시작 지점으로 돌아가기·GPS로 멀리 옮기기)은 5초에 한 번만 받는다 */
const TELEPORT_COOLDOWN_MS = 5000

export interface RelayPlayer {
  /** 방송용 짧은 id — socket.id(20자)를 매 틱 싣지 않는다 */
  id: string
  state: Partial<ScenePlayerState>
  /** 지난 틱 이후 바뀐 필드 */
  dirty: Partial<ScenePlayerState>
  /** 이동 거리 예산(m)과 마지막으로 채운 시각 */
  budget: number
  budgetAt: number
  teleportAt: number
  lastMessageAt: number
  windowStart: number
  windowCount: number
}

export function createRelayPlayer(id: string, now: number): RelayPlayer {
  return {
    id,
    state: {},
    dirty: {},
    budget: BURST_M,
    budgetAt: now,
    teleportAt: -Infinity,
    lastMessageAt: now,
    windowStart: now,
    windowCount: 0,
  }
}

/** 월드마다 다른 위치 규칙 — p를 검증·반올림하고, 두 위치 사이 거리(m)를 잰다 */
export interface PositionRules {
  read(value: unknown): ScenePlayerState['p'] | null
  distance(a: ScenePlayerState['p'], b: ScenePlayerState['p']): number
}

/**
 * 받은 메시지 하나를 상태에 합친다. 필드마다 따로 검증해 틀린 필드만 버린다.
 * 초당 메시지가 너무 많으면 false — 호출한 쪽이 끊는다.
 */
export function receiveState(player: RelayPlayer, body: unknown, now: number, rules: PositionRules): boolean {
  if (!body || typeof body !== 'object') return true
  if (now - player.windowStart >= 1000) {
    player.windowStart = now
    player.windowCount = 0
  }
  if (++player.windowCount > MAX_MESSAGES_PER_SEC) return false
  player.lastMessageAt = now

  const { p, r, a, s } = body as Record<string, unknown>
  const position = rules.read(p)
  if (position && acceptMove(player, position, now, rules)) setField(player, 'p', position)
  const rotation = readNumbers(r, 2, Math.PI * 2 + 0.01, 2)
  if (rotation) setField(player, 'r', rotation as ScenePlayerState['r'])
  if (a === 0 || a === 1 || a === 2) setField(player, 'a', a)
  if (typeof s === 'number' && s >= 0 && s < 4) setField(player, 's', s)
  return true
}

/** 거리 예산 안의 이동만 받는다. 예산을 넘는 순간이동은 쿨다운마다 한 번 받는다 */
function acceptMove(player: RelayPlayer, next: ScenePlayerState['p'], now: number, rules: PositionRules): boolean {
  const prev = player.state.p
  if (!prev) return true
  player.budget = Math.min(BURST_M, player.budget + (MAX_SPEED_MS * (now - player.budgetAt)) / 1000)
  player.budgetAt = now
  const distance = rules.distance(prev, next)
  if (distance <= player.budget) {
    player.budget -= distance
    return true
  }
  if (now - player.teleportAt < TELEPORT_COOLDOWN_MS) return false
  player.teleportAt = now
  return true
}

function setField<K extends keyof ScenePlayerState>(player: RelayPlayer, key: K, value: ScenePlayerState[K]) {
  if (JSON.stringify(player.state[key]) === JSON.stringify(value)) return
  player.state[key] = value
  player.dirty[key] = value
}

/** 길이가 맞고 모두 |값| ≤ limit인 유한수 배열이면 소수 digits 자리로 반올림해 돌려준다 */
export function readNumbers(value: unknown, length: number, limit: number, digits: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null
  const k = 10 ** digits
  const out: number[] = []
  for (const v of value) {
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limit) return null
    out.push(Math.round(v * k) / k)
  }
  return out
}
