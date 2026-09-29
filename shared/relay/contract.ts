/**
 * 익명 상태 중계(relay) 소켓 계약 — 프론트·백엔드 공유 단일 소스(SSOT).
 *
 * 원본(Summer Afternoon) 릴레이가 주고받던 필드(위치·방향·모션·색 시드)를 그대로 쓴다.
 * 클라이언트는 바뀐 필드만 35ms마다 올리고, 서버는 35ms에 한 번 바뀐 필드를 묶어
 * 내린다. socket.io 제네릭에 꽂아 쓰면 한쪽만 바뀌었을 때 컴파일 단계에서 잡힌다.
 */

/**
 * 두 중계 — 이벤트는 같고, 받는 사람을 고르는 방식(관심 영역)과 위치(p)의 뜻만 다르다.
 * 이름은 방식을 따르고, 어느 화면이 쓰는지는 항목마다 적는다.
 * digits는 p를 반올림하는 소수 자리다(둘 다 약 1cm).
 */
export const RELAYS = {
  /** 방 — p는 씬 로컬 [x, y, z](m). 먼저 온 순서대로 20명씩 방을 채운다. 플레이 씬이 쓴다 */
  room: { namespace: '/room', digits: [2, 2, 2] },
  /** 근접 — p는 실제 좌표 [경도, 위도, 높이(m)]. 저마다 가까운 사람만 본다. 내 주변이 쓴다 */
  proximity: { namespace: '/proximity', digits: [7, 7, 2] },
} as const

export type RelayName = keyof typeof RELAYS

/** 아이 모션 — 원본 userData.a (0 기본(idle·run) · 1 공중 · 2 심심함) */
export type RelayMotion = 0 | 1 | 2

/** 아이 한 명의 상태 — 원본 RealmData */
export interface RelayPlayerState {
  /** 발 위치 — 방은 씬 로컬 [x, y, z](m), 근접은 [경도, 위도, 높이(m)] */
  p: [number, number, number]
  /** 몸 방향 [phi, theta] — 원본 spherical. theta는 등 뒤 방위(캐릭터 rotation.y − π) */
  r: [number, number]
  a: RelayMotion
  /** 색 시드 [0, 4) — 정수부 피부색, 소수부 옷 색조 */
  s: number
}

/** 서버가 내려주는 다른 아이의 변경분 — 처음 보는 아이는 네 필드가 다 모여야 그린다 */
export type RelayPeerUpdate = { id: string } & Partial<RelayPlayerState>

/** 방 배정 — id는 내 변경분을 거르는 데, room은 다시 붙을 때 같은 방을 청하는 데 쓴다(근접은 방이 없어 '') */
export interface RelayWelcome {
  id: string
  room: string
}

/** 서버 → 클라이언트 이벤트 */
export interface RelayServerToClientEvents {
  welcome: (body: RelayWelcome) => void
  states: (updates: RelayPeerUpdate[]) => void
  leave: (id: string) => void
}

/** 클라이언트 → 서버 이벤트 — 바뀐 필드만 담는다 */
export interface RelayClientToServerEvents {
  state: (body: Partial<RelayPlayerState>) => void
}
