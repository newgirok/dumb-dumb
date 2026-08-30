/** 클라이언트 GPS 속도 검증 — 30km/h 초과 패킷 드롭 */

const MAX_SPEED_MS = 30 / 3.6  // ≈ 8.33 m/s

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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
  const distM = haversineM(prev.lng, prev.lat, next.lng, next.lat)
  return distM / dtS <= MAX_SPEED_MS
}
