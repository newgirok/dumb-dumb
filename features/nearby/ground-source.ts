import type { LocalFrame } from '@/lib/geo/local-frame'
import { fetchTileWays, tileBounds, tilesCovering } from '@/lib/geo/vector-tiles'
import { drawGround, toLocalWay, WAY_MARGIN, type Context2D, type GroundPixels, type LocalWay } from './ground'

/** 구역 한 변(m)과 마스크 해상도 — 약 0.33m/px */
export const CHUNK = 256
export const RESOLUTION = 768
/** 받아 둔 z14 타일(약 2km) 수 — 넘으면 오래된 것부터 버린다 */
const MAX_TILES = 12

export interface GroundSource {
  /** 구역(cx, cz) — 북서쪽 모서리가 (cx·CHUNK, cz·CHUNK)인 칸의 마스크를 그린다 */
  build(cx: number, cz: number): Promise<GroundPixels>
}

/**
 * 구역 마스크를 만드는 곳 — 길 데이터를 z14 타일 단위로 받아 로컬 좌표로 바꿔 두고, 구역을
 * 그릴 때 그 구역에 걸치는 길만 골라 그린다. 워커(ground.worker.ts)에서 돌고, 워커를 못 쓰는
 * 브라우저에서는 메인 스레드에서 돈다.
 */
export function createGroundSource(frame: LocalFrame, ctx: Context2D, signal?: AbortSignal): GroundSource {
  const tiles = new Map<string, Promise<LocalWay[]>>()

  function tileWays(tx: number, ty: number): Promise<LocalWay[]> {
    const key = `${tx}/${ty}`
    let promise = tiles.get(key)
    if (!promise) {
      const b = tileBounds(tx, ty)
      const nw = frame.toLocal(b.west, b.north)
      const se = frame.toLocal(b.east, b.south)
      const rect = { minX: nw.x, minZ: nw.z, maxX: se.x, maxZ: se.z }
      promise = fetchTileWays(tx, ty, signal).then((ways) => ways.map((way) => toLocalWay(way, frame.toLocal, rect)))
      // 실패한 타일은 다음에 다시 받는다
      promise.catch(() => tiles.delete(key))
      tiles.set(key, promise)
      // 오래된 타일부터 버린다(Map은 넣은 순서를 지킨다)
      while (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value!)
    }
    return promise
  }

  return {
    async build(cx, cz) {
      const x0 = cx * CHUNK
      const z0 = cz * CHUNK
      const sw = frame.toLngLat(x0 - WAY_MARGIN, z0 + CHUNK + WAY_MARGIN)
      const ne = frame.toLngLat(x0 + CHUNK + WAY_MARGIN, z0 - WAY_MARGIN)
      const lists = await Promise.all(
        tilesCovering({ west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat }).map(([tx, ty]) => tileWays(tx, ty)),
      )
      const ways = lists.flat().filter(
        (w) =>
          w.maxX >= x0 - WAY_MARGIN && w.minX <= x0 + CHUNK + WAY_MARGIN &&
          w.maxZ >= z0 - WAY_MARGIN && w.minZ <= z0 + CHUNK + WAY_MARGIN,
      )
      return drawGround(ctx, { ways, x0, z0, size: CHUNK, resolution: RESOLUTION })
    },
  }
}
