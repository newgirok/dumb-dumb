/**
 * 익명 멀티플레이 소켓 계약 — 프론트·백엔드 공유 단일 소스(SSOT).
 *
 * 원본(Summer Afternoon) 릴레이가 주고받던 필드(위치·방향·모션·색 시드)를 그대로 쓴다.
 * 클라이언트는 바뀐 필드만 35ms마다 올리고, 서버는 35ms에 한 번 바뀐 필드를 묶어
 * 내린다. socket.io 제네릭에 꽂아 쓰면 한쪽만 바뀌었을 때 컴파일 단계에서 잡힌다.
 */

/**
 * 두 월드 — 이벤트는 같고 위치(p)의 뜻과 누구와 보이는지만 다르다.
 * digits는 p를 반올림하는 소수 자리다(둘 다 약 1cm).
 */
export const SCENE_WORLDS = {
  /** 여름 마을 섬 — p는 씬 로컬 [x, y, z](m). 먼저 온 순서대로 20명씩 방을 채운다 */
  island: { namespace: '/scene', digits: [2, 2, 2] },
  /** 내 동네 — p는 실제 좌표 [경도, 위도, 높이(m)]. 저마다 가까운 사람만 본다 */
  neighborhood: { namespace: '/neighborhood', digits: [7, 7, 2] },
} as const

export type SceneWorld = keyof typeof SCENE_WORLDS

/** 아이 모션 — 원본 userData.a (0 기본(idle·run) · 1 공중 · 2 심심함) */
export type SceneMotion = 0 | 1 | 2

/** 아이 한 명의 상태 — 원본 RealmData */
export interface ScenePlayerState {
  /** 발 위치 — 여름 마을은 씬 로컬 [x, y, z](m), 내 동네는 [경도, 위도, 높이(m)] */
  p: [number, number, number]
  /** 몸 방향 [phi, theta] — 원본 spherical. theta는 등 뒤 방위(캐릭터 rotation.y − π) */
  r: [number, number]
  a: SceneMotion
  /** 색 시드 [0, 4) — 정수부 피부색, 소수부 옷 색조 */
  s: number
}

/** 서버가 내려주는 다른 아이의 변경분 — 처음 보는 아이는 네 필드가 다 모여야 그린다 */
export type ScenePeerUpdate = { id: string } & Partial<ScenePlayerState>

/** 방 배정 — id는 내 변경분을 거르는 데, room은 다시 붙을 때 같은 방을 청하는 데 쓴다(내 동네는 방이 없어 '') */
export interface SceneWelcome {
  id: string
  room: string
}

/** 서버 → 클라이언트 이벤트 */
export interface SceneServerToClientEvents {
  welcome: (body: SceneWelcome) => void
  states: (updates: ScenePeerUpdate[]) => void
  leave: (id: string) => void
}

/** 클라이언트 → 서버 이벤트 — 바뀐 필드만 담는다 */
export interface SceneClientToServerEvents {
  state: (body: Partial<ScenePlayerState>) => void
}
