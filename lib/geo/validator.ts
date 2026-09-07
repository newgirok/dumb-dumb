import CheapRuler from 'cheap-ruler'

/** 클라이언트 GPS 속도 검증 — 30km/h 초과 패킷 드롭 */

const MAX_SPEED_MS = 30 / 3.6  // ≈ 8.33 m/s

// 서울 위도(37.5) 기준 — 프로젝트 전역이 서울 인근이라 위도 재계산 없이 고정 ruler 재사용
const ruler = new CheapRuler(37.5, 'meters')

function distanceM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  return ruler.distance([lng1, lat1], [lng2, lat2])
}

export interface StampedPos {
  lng: number
  lat: number
  ts: number  // performance.now() 또는 Date.now()
}

/**
 * 이전 위치 → 다음 위치 이동이 물리적으로 유효한지 검증.
 * 30km/h 초과 시 false 반환 → 브로드캐스트 드롭.
 */
export function isValidMove(prev: StampedPos, next: StampedPos): boolean {
  const dtS = (next.ts - prev.ts) / 1000
  if (dtS <= 0) return false
  const distM = distanceM(prev.lng, prev.lat, next.lng, next.lat)
  return distM / dtS <= MAX_SPEED_MS
}
