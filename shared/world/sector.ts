/**
 * 섹터 격자 — 500m × 500m. 프론트·백엔드 공유 단일 소스(SSOT).
 *
 * 예전에는 이 계산이 프론트(lib/geo/sector.ts)와 백엔드(apps/api/src/world/sector.ts)에
 * 따로 있었고, 프론트는 경도 스케일을 서울 위도(37.5°)로 고정해 둔 탓에 서울에서
 * 멀어질수록 양쪽이 서로 다른 섹터 ID를 계산했다. 여기 한 곳으로 모아 위도별로
 * 정확히 계산한다. 양쪽은 이 파일만 참조한다.
 */

const SECTOR_M = 500
/** 경계에서 이 거리 안이면 인접 섹터도 함께 본다 */
const PRE_JOIN_M = 50

const LAT_DEG = SECTOR_M / 111_000

/** 위도에 따라 달라지는 경도 1° 당 미터를 반영한 섹터 경도 폭 */
function lngDegAt(lat: number): number {
  return SECTOR_M / (111_000 * Math.cos((lat * Math.PI) / 180))
}

function gridOf(lng: number, lat: number): [number, number] {
  return [Math.floor(lng / lngDegAt(lat)), Math.floor(lat / LAT_DEG)]
}

export function sectorId(gx: number, gy: number): string {
  return `sector-${gx}-${gy}`
}

export function currentSectorId(lng: number, lat: number): string {
  const [gx, gy] = gridOf(lng, lat)
  return sectorId(gx, gy)
}

/** 현재 위치에서 구독해야 할 섹터들 (경계 근처면 인접 포함) */
export function requiredSectors(lng: number, lat: number): string[] {
  const [gx, gy] = gridOf(lng, lat)
  const lngDeg = lngDegAt(lat)

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
