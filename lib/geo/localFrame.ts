/**
 * 위경도 ↔ 원점 기준 로컬 미터 좌표(동쪽 +x, 북쪽 −z, 1 = 1m).
 * 내 동네 시험판은 반경 수백 m라 등장방형 근사로 충분하다(오차 0.1% 미만).
 */
const M_PER_DEG_LAT = 110_574
const M_PER_DEG_LNG_AT_EQUATOR = 111_320

export interface LocalFrame {
  lng0: number
  lat0: number
  toLocal(lng: number, lat: number): { x: number; z: number }
  toLngLat(x: number, z: number): { lng: number; lat: number }
}

export function createLocalFrame(lng0: number, lat0: number): LocalFrame {
  const kx = M_PER_DEG_LNG_AT_EQUATOR * Math.cos((lat0 * Math.PI) / 180)
  return {
    lng0,
    lat0,
    toLocal: (lng, lat) => ({ x: (lng - lng0) * kx, z: -(lat - lat0) * M_PER_DEG_LAT }),
    toLngLat: (x, z) => ({ lng: lng0 + x / kx, lat: lat0 - z / M_PER_DEG_LAT }),
  }
}
