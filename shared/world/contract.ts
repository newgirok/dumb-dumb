/**
 * 월드 소켓 이벤트 계약 — 프론트·백엔드 공유 단일 소스(SSOT).
 *
 * socket.io 제네릭(Server<Listen, Emit> / Socket<Listen, Emit>)에 꽂아 쓰면
 * 이벤트 이름·페이로드가 한쪽만 바뀌었을 때 컴파일 단계에서 잡힌다.
 */

/** 서버가 섹터 단위로 묶어 내려주는 피어 위치 */
export interface PeerPosition {
  userId: string
  lng: number
  lat: number
}

/** 채팅 방송 페이로드 */
export interface ChatMessage {
  userId: string
  nickname: string
  text: string
}

/** 클라이언트가 올리는 이동 좌표 */
export interface MovePayload {
  lng: number
  lat: number
  nickname?: string
}

/** 클라이언트가 올리는 채팅 */
export interface ChatPayload {
  text: string
}

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
  positions: (positions: PeerPosition[]) => void
  chat: (msg: ChatMessage) => void
}

/** 클라이언트 → 서버 이벤트 */
export interface ClientToServerEvents {
  move: (body: MovePayload) => void
  chat: (body: ChatPayload) => void
}
