/** 섹터: 500m × 500m 격자 기반 멀티 채널 관리 */

const SECTOR_M = 500
const PRE_JOIN_M = 50

// 위도 1° ≈ 111,000m (고정)
const LAT_DEG = SECTOR_M / 111000
// 서울 위도(37.5°) 기준 경도 1° ≈ 88,000m
const LNG_DEG = SECTOR_M / (111000 * Math.cos((37.5 * Math.PI) / 180))

function gridOf(lng: number, lat: number): [number, number] {
  return [Math.floor(lng / LNG_DEG), Math.floor(lat / LAT_DEG)]
}

export function sectorId(gx: number, gy: number): string {
  return `sector-${gx}-${gy}`
}

export function currentSectorId(lng: number, lat: number): string {
  const [gx, gy] = gridOf(lng, lat)
  return sectorId(gx, gy)
}

/**
 * 현재 위치에서 구독해야 할 섹터 ID 목록을 반환.
 * 경계에서 PRE_JOIN_M 이내면 인접 섹터도 포함.
 */
export function requiredSectors(lng: number, lat: number): string[] {
  const [gx, gy] = gridOf(lng, lat)
  const set = new Set<string>()
  set.add(sectorId(gx, gy))

  const preJoinLat = PRE_JOIN_M / 111000
  const preJoinLng = PRE_JOIN_M / (111000 * Math.cos((lat * Math.PI) / 180))

  const minLat = gy * LAT_DEG
  const maxLat = (gy + 1) * LAT_DEG
  const minLng = gx * LNG_DEG
  const maxLng = (gx + 1) * LNG_DEG

  if (lat - minLat < preJoinLat) set.add(sectorId(gx, gy - 1))
  if (maxLat - lat < preJoinLat) set.add(sectorId(gx, gy + 1))
  if (lng - minLng < preJoinLng) set.add(sectorId(gx - 1, gy))
  if (maxLng - lng < preJoinLng) set.add(sectorId(gx + 1, gy))

  return [...set]
}
