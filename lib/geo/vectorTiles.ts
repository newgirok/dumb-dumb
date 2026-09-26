import { VectorTile, type VectorTileLayer } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'

/**
 * OpenStreetMap 벡터 타일(OpenFreeMap, OpenMapTiles 스키마)에서 길을 읽는다.
 *
 * 브라우저가 CDN 타일을 직접 받는다 — 요청은 z14 타일 단위(약 2km)라 정확한 위치가
 * 밖으로 나가지 않는다. 출처 표기 필수: OpenFreeMap © OpenMapTiles Data from OpenStreetMap.
 */
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet'
const ZOOM = 14

/** 땅 위에 그릴 길 하나 — 좌표는 [경도, 위도] */
export interface MapWay {
  /** OpenMapTiles class(primary·minor·service·path…)와 subclass(footway·pedestrian…) */
  cls: string
  sub: string
  /** 도로 이름(세종대로·망원로10길…) — 같은 타일 transportation_name에서 찾는다. 없으면 '' */
  name: string
  oneway: boolean
  ramp: boolean
  /** 광장처럼 면으로 된 길 */
  area: boolean
  parts: [number, number][][]
}

export interface LngLatBounds {
  west: number
  south: number
  east: number
  north: number
}

/** 땅 위에 없는 것 — 철도·지하철·케이블카·뱃길·경주로·공사 중·실내·승강장 */
const SKIP_CLASS = /^(rail|transit|aerialway|ferry|raceway|bus_guideway)$|_construction$/
const SKIP_SUBCLASS = /^(platform|corridor)$/

let tileTemplate: Promise<string> | null = null

function getTemplate(): Promise<string> {
  // 타일 주소에 데이터 버전이 들어 있어 TileJSON에서 받는다(실패하면 다음에 다시 받는다)
  tileTemplate ??= fetch(TILEJSON_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`TileJSON ${res.status}`)
      return res.json() as Promise<{ tiles: string[] }>
    })
    .then((json) => json.tiles[0])
    .catch((error) => {
      tileTemplate = null
      throw error
    })
  return tileTemplate
}

/** 이름선 격자 한 칸(타일 좌표, z14에서 약 60m)과 이름을 인정하는 거리(약 2m) */
const NAME_CELL = 128
const NAME_TOLERANCE = 4

type Point = { x: number; y: number }

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * 도로 이름은 transportation 레이어에 없고 transportation_name 레이어에 따로 있다.
 * 이름선의 선분을 격자에 넣어 두고, 도로 선의 선분 가운데점마다 가까운 이름을 찾아 다수결로 고른다
 * (같은 OSM 길에서 나와 대부분 겹치지만 꼭짓점이 모두 같지는 않다).
 */
function createNameLookup(layer: VectorTileLayer | undefined): (lines: Point[][]) => string {
  const cells = new Map<string, { a: Point; b: Point; name: string }[]>()
  if (layer) {
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      const name = String(feature.properties.name ?? '')
      if (feature.type !== 2 || !name) continue
      for (const line of feature.loadGeometry()) {
        for (let j = 1; j < line.length; j++) {
          const a = line[j - 1]
          const b = line[j]
          for (let cx = Math.floor(Math.min(a.x, b.x) / NAME_CELL); cx <= Math.floor(Math.max(a.x, b.x) / NAME_CELL); cx++) {
            for (let cy = Math.floor(Math.min(a.y, b.y) / NAME_CELL); cy <= Math.floor(Math.max(a.y, b.y) / NAME_CELL); cy++) {
              const key = `${cx},${cy}`
              const list = cells.get(key) ?? []
              list.push({ a, b, name })
              cells.set(key, list)
            }
          }
        }
      }
    }
  }
  const nearest = (p: Point): string => {
    let best = NAME_TOLERANCE
    let name = ''
    for (let cx = Math.floor((p.x - NAME_TOLERANCE) / NAME_CELL); cx <= Math.floor((p.x + NAME_TOLERANCE) / NAME_CELL); cx++) {
      for (let cy = Math.floor((p.y - NAME_TOLERANCE) / NAME_CELL); cy <= Math.floor((p.y + NAME_TOLERANCE) / NAME_CELL); cy++) {
        for (const segment of cells.get(`${cx},${cy}`) ?? []) {
          const d = distanceToSegment(p, segment.a, segment.b)
          if (d < best) {
            best = d
            name = segment.name
          }
        }
      }
    }
    return name
  }
  return (lines) => {
    const votes = new Map<string, number>()
    for (const line of lines) {
      for (let j = 1; j < line.length; j++) {
        const name = nearest({ x: (line[j - 1].x + line[j].x) / 2, y: (line[j - 1].y + line[j].y) / 2 })
        if (name) votes.set(name, (votes.get(name) ?? 0) + 1)
      }
    }
    let best = ''
    let count = 0
    for (const [name, n] of votes) if (n > count) [best, count] = [name, n]
    return best
  }
}

const lngToTileX = (lng: number, n: number) => Math.floor(((lng + 180) / 360) * n)
const latToTileY = (lat: number, n: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
}

const tileXToLng = (x: number, n: number) => (x / n) * 360 - 180
const tileYToLat = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI

/** z14 타일 하나가 덮는 범위 — 타일 데이터는 이 밖으로 조금(버퍼) 더 나와 있다 */
export function tileBounds(tx: number, ty: number): LngLatBounds {
  const n = 2 ** ZOOM
  return { west: tileXToLng(tx, n), east: tileXToLng(tx + 1, n), north: tileYToLat(ty, n), south: tileYToLat(ty + 1, n) }
}

/** 범위를 덮는 z14 타일 번호 [x, y] */
export function tilesCovering(bounds: LngLatBounds): [number, number][] {
  const n = 2 ** ZOOM
  const tiles: [number, number][] = []
  for (let x = lngToTileX(bounds.west, n); x <= lngToTileX(bounds.east, n); x++) {
    for (let y = latToTileY(bounds.north, n); y <= latToTileY(bounds.south, n); y++) tiles.push([x, y])
  }
  return tiles
}

/** z14 타일 하나를 받아 땅 위의 길만 돌려준다(타일 경계에 걸친 길은 이웃 타일과 조금씩 겹친다) */
export async function fetchTileWays(tx: number, ty: number, signal?: AbortSignal): Promise<MapWay[]> {
  const template = await getTemplate()
  const n = 2 ** ZOOM
  const url = template.replace('{z}', String(ZOOM)).replace('{x}', String(tx)).replace('{y}', String(ty))
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`tile ${ZOOM}/${tx}/${ty} ${res.status}`)
  const tile = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())))

  const ways: MapWay[] = []
  const layer = tile.layers.transportation
  if (!layer) return ways
  const nameOf = createNameLookup(tile.layers.transportation_name)
  const toLngLat = (px: number, py: number): [number, number] => [
    tileXToLng(tx + px / layer.extent, n),
    tileYToLat(ty + py / layer.extent, n),
  ]
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const p = feature.properties
    const cls = String(p.class ?? '')
    const sub = String(p.subclass ?? '')
    if (feature.type === 1 || SKIP_CLASS.test(cls) || SKIP_SUBCLASS.test(sub)) continue
    if (p.brunnel === 'tunnel' || p.indoor) continue
    const geometry = feature.loadGeometry()
    ways.push({
      cls,
      sub,
      name: feature.type === 2 ? nameOf(geometry) : '',
      oneway: p.oneway === 1,
      ramp: p.ramp === 1,
      area: feature.type === 3,
      parts: geometry.map((ring) => ring.map((pt) => toLngLat(pt.x, pt.y))),
    })
  }
  return ways
}
