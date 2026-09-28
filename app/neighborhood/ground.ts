import type { MapWay } from '@/lib/geo/vectorTiles'

/**
 * 차도 폭(m) — 도로명 끝 글자로 정한다(도로명주소 부여 기준: 대로 폭 40m 이상, 로 12~40m,
 * 길은 그 밖). 대로·로가 방향마다 한 줄씩(일방) 그려졌으면 한 줄은 절반이라 두 줄이 모여
 * 한 길이 된다. 일방통행 '길'은 그 자체로 한 길이다.
 */
type Grade = 'daero' | 'ro' | 'gil'
const GRADE_WIDTH: Record<Grade, number> = { daero: 40, ro: 20, gil: 8 }
/** 이름이 없는 주차장 통로·진입로와 램프 */
const SERVICE_WIDTH = 5
const RAMP_WIDTH = 8
const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'busway'])
/** '대로'로 끝나도 이 등급이 아니면 '로'로 본다 — '경기대 + 로'처럼 학교 이름이 붙은 좁은 길을 거른다 */
const MAJOR_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary'])
/** 차도 양옆 인도 폭 — 원작 도로 양옆 흙길(0.5~1.6m)에 맞춘다 */
const SIDEWALK = 1
/** 흙길로 그리는 길 — 보행자 거리는 넓게, 나머지 인도·산책로·자전거길·계단은 좁게 */
const PEDESTRIAN_WIDTH = 4
const PATH_WIDTH = 2.2
const TRACK_WIDTH = 3
/** 왕복 차도 가운데 점선 — 3m 칠하고 3m 비운다 */
const CENTERLINE_WIDTH = 0.45
const CENTERLINE_DASH = 3
const CENTERLINE_PERIOD = CENTERLINE_DASH * 2

/** 구역 경계 밖에 있어도 폭 때문에 구역 안으로 들어오는 길을 잡는 여유(가장 넓은 길의 절반 + 인도) */
export const WAY_MARGIN = GRADE_WIDTH.daero / 2 + SIDEWALK

/** 로컬 m 사각형(북쪽이 −z) */
export interface Rect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** 가운데 점선 한 줄 — 선([x0, z0, x1, z1, …])과 칠하는 길이(= 비우는 길이), 무늬 시작 위치(m) */
interface Centerline {
  points: Float32Array
  dash: number
  offset: number
}

/** 로컬 미터 좌표로 바꾼 길 — parts는 [x0, z0, x1, z1, …] */
export type LocalWay = Omit<MapWay, 'parts'> & Rect & {
  parts: Float32Array[]
  centerlines: Centerline[]
}

type WayTags = Pick<MapWay, 'cls' | 'sub' | 'name' | 'oneway' | 'ramp' | 'area'>

/**
 * 이름으로 대로·로·길을 가리고, 이름이 없으면 등급으로 가늠한다. 고속도로·도시고속도로
 * (강변북로·올림픽대로 등, motorway·trunk)는 이름이 '로'여도 방향마다 여러 차로라 대로로 본다.
 */
function grade(way: WayTags): Grade {
  if (way.cls === 'motorway' || way.cls === 'trunk') return 'daero'
  if (/대로$/.test(way.name)) return MAJOR_CLASSES.has(way.cls) ? 'daero' : 'ro'
  if (/길$/.test(way.name)) return 'gil'
  if (/로$/.test(way.name)) return 'ro'
  if (way.cls === 'primary' || way.cls === 'secondary' || way.cls === 'tertiary') return 'ro'
  return 'gil'
}

function roadWidth(way: WayTags): number | null {
  if (!ROAD_CLASSES.has(way.cls) || way.area) return null
  if (way.ramp) return RAMP_WIDTH
  if (way.cls === 'service' && !way.name) return SERVICE_WIDTH
  const g = grade(way)
  return way.oneway && g !== 'gil' ? GRADE_WIDTH[g] / 2 : GRADE_WIDTH[g]
}

function pathWidth(way: WayTags): number | null {
  if (way.cls === 'track') return TRACK_WIDTH
  if (way.cls !== 'path') return null
  return way.sub === 'pedestrian' ? PEDESTRIAN_WIDTH : PATH_WIDTH
}

interface Piece {
  points: number[]
  /** 조각 끝이 사각형 변에서 잘렸나 */
  cutStart: boolean
  cutEnd: boolean
}

/** 선을 사각형으로 잘라 안쪽 조각만 남긴다(선분마다 Liang–Barsky) */
function clipToRect(line: Float32Array, rect: Rect): Piece[] {
  const pieces: Piece[] = []
  let current: Piece | null = null
  for (let i = 2; i < line.length; i += 2) {
    const ax = line[i - 2]
    const az = line[i - 1]
    const dx = line[i] - ax
    const dz = line[i + 1] - az
    let t0 = 0
    let t1 = 1
    let inside = true
    for (const [p, q] of [
      [-dx, ax - rect.minX],
      [dx, rect.maxX - ax],
      [-dz, az - rect.minZ],
      [dz, rect.maxZ - az],
    ]) {
      if (p === 0) {
        if (q < 0) inside = false
        continue
      }
      const t = q / p
      if (p < 0) t0 = Math.max(t0, t)
      else t1 = Math.min(t1, t)
    }
    if (!inside || t0 > t1) {
      if (current) {
        current.cutEnd = true
        pieces.push(current)
        current = null
      }
      continue
    }
    current ??= { points: [ax + t0 * dx, az + t0 * dz], cutStart: t0 > 0, cutEnd: false }
    current.points.push(ax + t1 * dx, az + t1 * dz)
    if (t1 < 1) {
      current.cutEnd = true
      pieces.push(current)
      current = null
    }
  }
  if (current) pieces.push(current)
  return pieces
}

/**
 * 점선 박자를 타일 경계에 맞춘다. 길 데이터는 타일마다 따로 오고 같은 길이 이웃 타일에도
 * 겹쳐 들어 있어서, 선 시작점부터 무늬를 세면 타일 경계 둘레에서 두 박자가 겹치고 끊긴다.
 * 그래서 가운데 점선만은 제 타일 안쪽으로 잘라 한 번씩만 그리고, 잘린 끝(타일 경계)에는 늘
 * 틈 한가운데가 오게 한다. 이웃 타일의 같은 길도 같은 자리에서 잘리므로 박자가 이어진다.
 * 양 끝이 모두 경계면 그 사이에 무늬가 딱 맞게 주기를 조금 늘이거나 줄인다(100m 길이면 3% 안).
 */
function dashed({ points, cutStart, cutEnd }: Piece): Centerline | null {
  let length = 0
  for (let i = 2; i < points.length; i += 2) length += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1])
  if (length < 0.01) return null
  let period = CENTERLINE_PERIOD
  let offset = 0
  if (cutStart && cutEnd) {
    period = length / Math.max(1, Math.round(length / CENTERLINE_PERIOD))
    offset = period * 0.75
  } else if (cutStart) {
    offset = period * 0.75
  } else if (cutEnd) {
    offset = (((period * 0.75 - length) % period) + period) % period
  }
  return { points: Float32Array.from(points), dash: period / 2, offset }
}

/**
 * 타일에서 읽은 길 하나를 로컬 m로 바꾼다. 왕복 차도면 가운데 점선을 타일(tile, 로컬 m)
 * 안쪽으로 잘라 박자까지 정해 둔다.
 */
export function toLocalWay(way: MapWay, toLocal: (lng: number, lat: number) => { x: number; z: number }, tile: Rect): LocalWay {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  const parts = way.parts.map((part) => {
    const out = new Float32Array(part.length * 2)
    part.forEach(([lng, lat], i) => {
      const p = toLocal(lng, lat)
      out[i * 2] = p.x
      out[i * 2 + 1] = p.z
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    })
    return out
  })
  const centerlines =
    roadWidth(way) && !way.oneway && !way.ramp
      ? parts.flatMap((part) => clipToRect(part, tile).map(dashed).filter((line) => line !== null))
      : []
  return { ...way, parts, centerlines, minX, minZ, maxX, maxZ }
}

/** 한 구역의 마스크 — masks는 RGBA(r 도로 · b 흙길), marks는 한 채널(차선). 첫 줄이 남쪽 끝이다 */
export interface GroundPixels {
  masks: Uint8Array<ArrayBuffer>
  marks: Uint8Array<ArrayBuffer>
}

export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * 내 주변 바닥 한 구역의 마스크를 그린다 — 원작 지형 셰이더에 꽂을 채널 그대로다
 * (원작 masks.png: r 도로 · g 모래 · b 흙길 · a 다리. 차선은 원작 terrain-road 텍스처처럼
 * r 값이 밝은 곳). 바닥은 평평하다(고도 없음). 구역마다 따로 그리지만 길 선은 경계를 넘어
 * 이어 그리므로 이웃 구역과 이음매 없이 맞는다. 메인 스레드·워커 어느 캔버스로도 그린다.
 */
export function drawGround(
  ctx: Context2D,
  { ways, x0, z0, size, resolution }: { ways: LocalWay[]; x0: number; z0: number; size: number; resolution: number },
): GroundPixels {
  const n = resolution
  const scale = n / size
  if (ctx.canvas.width !== n || ctx.canvas.height !== n) ctx.canvas.width = ctx.canvas.height = n
  // 캔버스는 북쪽이 위 — x 동쪽, 아래로 갈수록 남쪽(+z)
  const trace = (part: Float32Array, close = false) => {
    for (let i = 0; i < part.length; i += 2) {
      const x = (part[i] - x0) * scale
      const y = (part[i + 1] - z0) * scale
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    if (close) ctx.closePath()
  }
  const stroke = (way: LocalWay, widthM: number) => {
    ctx.lineWidth = widthM * scale
    for (const part of way.parts) {
      ctx.beginPath()
      trace(part)
      ctx.stroke()
    }
  }
  /** 흰 선을 검은 바탕에 그려 한 채널로 읽는다 */
  const pass = (draw: () => void): Uint8ClampedArray => {
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, n, n)
    ctx.fillStyle = ctx.strokeStyle = '#fff'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    draw()
    return ctx.getImageData(0, 0, n, n).data
  }

  const road = pass(() => {
    for (const way of ways) {
      const width = roadWidth(way)
      if (width) stroke(way, width)
    }
  })
  const path = pass(() => {
    for (const way of ways) {
      const width = roadWidth(way)
      if (width) stroke(way, width + SIDEWALK * 2)
      else if (way.area && way.cls === 'path') {
        // 광장처럼 면으로 된 보행 공간 — 구멍(안쪽 고리)은 짝홀 규칙으로 뺀다
        ctx.beginPath()
        for (const ring of way.parts) trace(ring, true)
        ctx.fill('evenodd')
      } else {
        const w = pathWidth(way)
        if (w) stroke(way, w)
      }
    }
  })
  const marks = pass(() => {
    ctx.lineWidth = CENTERLINE_WIDTH * scale
    for (const way of ways) {
      for (const line of way.centerlines) {
        ctx.setLineDash([line.dash * scale, line.dash * scale])
        ctx.lineDashOffset = line.offset * scale
        ctx.beginPath()
        trace(line.points)
        ctx.stroke()
      }
    }
  })

  // 텍스처 첫 줄은 v=0(남쪽 끝)이라 캔버스를 위아래로 뒤집어 담는다
  const maskData = new Uint8Array(n * n * 4)
  const markData = new Uint8Array(n * n)
  for (let row = 0; row < n; row++) {
    const src = row * n * 4
    const dst = (n - 1 - row) * n
    for (let col = 0; col < n; col++) {
      const s = src + col * 4
      maskData[(dst + col) * 4] = road[s]
      maskData[(dst + col) * 4 + 2] = path[s]
      markData[dst + col] = marks[s]
    }
  }
  return { masks: maskData, marks: markData }
}
