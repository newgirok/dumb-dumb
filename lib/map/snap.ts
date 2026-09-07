import mapboxgl from 'mapbox-gl'

const SNAP_RADIUS_M = 15
const PIXEL_QUERY = 25

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number) {
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

/** 선분 AB 위에서 P에 가장 가까운 점 (lng, lat) 반환 */
function nearestOnSegment(
  pLng: number, pLat: number,
  aLng: number, aLat: number,
  bLng: number, bLat: number,
): [number, number] {
  const dx = bLng - aLng
  const dy = bLat - aLat
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return [aLng, aLat]
  const t = Math.max(0, Math.min(1, ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq))
  return [aLng + t * dx, aLat + t * dy]
}

export function snapToRoad(
  map: mapboxgl.Map,
  lng: number,
  lat: number,
): [number, number] {
  const pt = map.project([lng, lat])
  // $type=='LineString'만으로는 행정경계·수로·울타리·활주로 등 도로가 아닌
  // 선형 피처까지 다 걸려서(특히 Standard 스타일은 이런 레이어가 훨씬 많음)
  // 엉뚱한 선에 캐릭터가 붙는 문제가 있었음 — source-layer가 실제 도로
  // 벡터타일 레이어인 'road'인 것만 추려서 진짜 도로에만 스냅되도록 함
  const features = map
    .queryRenderedFeatures(
      [
        [pt.x - PIXEL_QUERY, pt.y - PIXEL_QUERY],
        [pt.x + PIXEL_QUERY, pt.y + PIXEL_QUERY],
      ],
      { filter: ['==', '$type', 'LineString'] },
    )
    .filter((f) => f.sourceLayer === 'road')

  if (!features.length) return [lng, lat]

  let minDist = Infinity
  let snapLng = lng
  let snapLat = lat

  for (const feat of features) {
    const geo = (feat as unknown as { geometry: { type: string; coordinates: [number, number][] } }).geometry
    if (!geo || geo.type !== 'LineString') continue
    const coords = geo.coordinates
    for (let i = 0; i < coords.length - 1; i++) {
      const [sLng, sLat] = nearestOnSegment(lng, lat, coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
      const d = haversineM(lng, lat, sLng, sLat)
      if (d < minDist) { minDist = d; snapLng = sLng; snapLat = sLat }
    }
  }

  return minDist <= SNAP_RADIUS_M ? [snapLng, snapLat] : [lng, lat]
}
