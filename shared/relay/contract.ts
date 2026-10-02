/**
 * 익명 상태 중계(relay) 소켓 계약 — 프론트·백엔드 공유 단일 소스(SSOT).
 *
 * 원본(Summer Afternoon) 릴레이가 주고받던 필드(위치·방향·모션·색 시드)를 그대로 쓴다.
 * 클라이언트는 바뀐 필드만 35ms마다 올리고, 서버는 35ms에 한 번 바뀐 필드를 묶어
 * 내린다. 만남 대화(talk*) 이벤트도 같은 연결로 오간다. socket.io 제네릭에 꽂아 쓰면
 * 한쪽만 바뀌었을 때 컴파일 단계에서 잡힌다.
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

/** 캐릭터 모션 — 원본 userData.a (0 기본(idle·run) · 1 공중 · 2 심심함) */
export type RelayMotion = 0 | 1 | 2

/** 캐릭터 한 명의 상태 — 원본 RealmData */
export interface RelayPlayerState {
  /** 발 위치 — 방은 씬 로컬 [x, y, z](m), 근접은 [경도, 위도, 높이(m)] */
  p: [number, number, number]
  /** 몸 방향 [phi, theta] — 원본 spherical. theta는 등 뒤 방위(캐릭터 rotation.y − π) */
  r: [number, number]
  a: RelayMotion
  /** 색 시드 [0, 4) — 정수부 피부색, 소수부 옷 색조 */
  s: number
}

/** 서버가 내려주는 다른 캐릭터의 변경분 — 처음 보는 캐릭터는 네 필드가 다 모여야 그린다 */
export type RelayPeerUpdate = { id: string } & Partial<RelayPlayerState>

/** 방 배정 — id는 내 변경분을 거르는 데, room은 다시 붙을 때 같은 방을 청하는 데 쓴다(근접은 방이 없어 '') */
export interface RelayWelcome {
  id: string
  room: string
}

/**
 * 만남 대화 — 가까이 온 사람에게 말을 걸고, 상대가 받아들이면 두 사람만 보는 1:1 대화가 열린다.
 * 버튼은 화면이 띄우고(가까이 들어오면 뜨고 더 멀어져야 사라진다), 성사·종료 판정은 서버가 한다.
 * 대화는 저장하지 않는다.
 */
export const TALK = {
  /**
   * 말 걸기 버튼 — 이 거리 안에 이 시간 머물면 뜨고, 나가는 거리보다 멀어지면 사라진다(0.5m는 경계에서 깜빡이지 않게 둔 여유).
   * 야외에서 평소 목소리로 대화하는 거리(사교 거리 1.2~3.6m, 보통 1~4m)까지 다가와야 말을 걸 수 있다
   */
  promptEnterM: 4,
  promptExitM: 4.5,
  dwellMs: 2000,
  /** 서버가 받는 요청 거리 — 화면과 서버가 보는 위치가 잠깐 다를 수 있어 버튼이 사라지는 거리보다 넉넉하게 둔다 */
  inviteRangeM: 6,
  /** 받은 요청은 이 시간 뒤 사라진다 */
  inviteTtlMs: 15_000,
  /** 거절·시간 초과 뒤 같은 사람에게 다시 걸 수 없는 시간 */
  cooldownMs: 300_000,
  /** 요청 빈도 한도 — 1분에 이만큼 */
  invitesPerMinute: 6,
  /** 한 번에 보내는 글자 수와 최소 간격 */
  maxChars: 200,
  sendGapMs: 500,
  /** 이 거리보다 멀어진 채 이 시간이 지나면 끝난다 — 목소리를 크게 높여야 닿는 거리(5~10m)를 넘으면 */
  farM: 10,
  farGraceMs: 10_000,
  /** 아무 말 없이 이 시간이 지나면 끝난다 */
  idleMs: 180_000,
} as const

/** 대화가 끝난 까닭 — 내가 끝냄·상대가 끝냄·멀어짐·조용함·상대가 떠남 */
export type RelayTalkEnd = 'self' | 'left' | 'far' | 'idle' | 'gone'

/** 대화에 오가는 글 한 줄 — from은 보낸 사람의 중계 id */
export interface RelayTalkMessage {
  from: string
  text: string
}

/** 링크는 보낼 수 없다 — 화면은 미리 막고 서버는 버린다 */
export function hasLink(text: string): boolean {
  return /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|kr|io|me|co|ly|gg|app|xyz|link|site|shop)\b/i.test(text)
}

/** 서버 → 클라이언트 이벤트 */
export interface RelayServerToClientEvents {
  welcome: (body: RelayWelcome) => void
  states: (updates: RelayPeerUpdate[]) => void
  leave: (id: string) => void
  /** 누가 말을 걸었다 — TALK.inviteTtlMs 안에 답한다 */
  talkInvited: (from: string) => void
  /** 받은 요청이 사라졌다 — 건 사람이 거두거나 떠났거나 시간이 지났다 */
  talkInviteEnded: (from: string) => void
  /** 건 요청이 이어지지 않았다 — 거절·시간 초과·상대가 바쁨을 구분하지 않는다 */
  talkDeclined: (to: string) => void
  /** 대화가 열렸다 — 두 사람 모두 받는다 */
  talkStarted: (peer: string) => void
  /** 대화 글 — 보낸 사람에게도 돌아간다 */
  talkMessage: (message: RelayTalkMessage) => void
  talkEnded: (reason: RelayTalkEnd) => void
}

/** 클라이언트 → 서버 이벤트 — 상태는 바뀐 필드만 담는다 */
export interface RelayClientToServerEvents {
  state: (body: Partial<RelayPlayerState>) => void
  /** 말을 건다 — to는 상대의 중계 id */
  talkInvite: (to: string) => void
  /** 받은 요청에 답한다 */
  talkReply: (body: { from: string; accept: boolean }) => void
  /** 대화 중인 상대에게 글을 보낸다 */
  talkSend: (text: string) => void
  /** 대화를 끝내거나 건 요청을 거둔다 */
  talkLeave: () => void
}
