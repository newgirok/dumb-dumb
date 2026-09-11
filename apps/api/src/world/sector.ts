/**
 * 섹터 격자 — 500m × 500m.
 *
 * 기존에는 클라이언트가 섹터를 계산해 채널을 직접 구독했는데, 이제 서버가
 * 좌표를 받아 섹터를 정한다. 양쪽이 같은 계산을 중복으로 들고 있으면
 * 언젠가 어긋나고, 클라이언트가 남의 섹터를 구독하는 것도 막을 수 없다.
 */

const SECTOR_M = 500
/** 경계에서 이 거리 안이면 인접 섹터도 함께 본다 */
const PRE_JOIN_M = 50

const LAT_DEG = SECTOR_M / 111_000

function lngDegAt(lat: number): number {
  return SECTOR_M / (111_000 * Math.cos((lat * Math.PI) / 180))
}

export function sectorId(gx: number, gy: number): string {
  return `sector-${gx}-${gy}`
}

/** 현재 위치에서 구독해야 할 섹터들 (경계 근처면 인접 포함) */
export function requiredSectors(lng: number, lat: number): string[] {
  const lngDeg = lngDegAt(lat)
  const gx = Math.floor(lng / lngDeg)
  const gy = Math.floor(lat / LAT_DEG)

  const sectors = new Set<string>([sectorId(gx, gy)])

  const preJoinLat = PRE_JOIN_M / 111_000
  const preJoinLng = PRE_JOIN_M / (111_000 * Math.cos((lat * Math.PI) / 180))

  if (lat - gy * LAT_DEG < preJoinLat) sectors.add(sectorId(gx, gy - 1))
  if ((gy + 1) * LAT_DEG - lat < preJoinLat) sectors.add(sectorId(gx, gy + 1))
  if (lng - gx * lngDeg < preJoinLng) sectors.add(sectorId(gx - 1, gy))
  if ((gx + 1) * lngDeg - lng < preJoinLng) sectors.add(sectorId(gx + 1, gy))

  return [...sectors]
}

const EARTH_R = 6_371_000

/** 두 좌표 사이 거리(m) */
export function distanceM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** 도보로 불가능한 속도면 순간이동으로 보고 버린다 (30km/h) */
const MAX_SPEED_MS = 30 / 3.6

export function isPlausibleMove(
  prev: { lng: number; lat: number; ts: number } | undefined,
  next: { lng: number; lat: number; ts: number },
): boolean {
  if (!prev) return true
  const dt = (next.ts - prev.ts) / 1000
  if (dt <= 0) return false
  return distanceM(prev.lng, prev.lat, next.lng, next.lat) / dt <= MAX_SPEED_MS
}
