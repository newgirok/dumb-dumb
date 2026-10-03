import * as THREE from 'three'
import type { LocalFrame } from '@/lib/geo/local-frame'
import { createTerrainMaterial, type SharedUniforms } from '@/lib/three/ramp-shader'
import type { GroundPixels } from './ground'
import { CHUNK, createGroundSource, RESOLUTION, type GroundSource } from './ground-source'
import type { GroundWorkerRequest, GroundWorkerResponse } from './ground.worker'

/** 캐릭터가 선 구역 둘레 이만큼(구역 수)을 깔아 둔다 — 가장자리에 서도 앞쪽 256m가 깔려 있다(보이는 거리 175m) */
const LOAD_RING = 1
/** 이보다 멀어진 구역은 치운다 — 경계를 오가도 곧바로 다시 그리지 않게 한 칸 여유를 둔다 */
const KEEP_RING = 2
/** 구역이 깔리기 전 빈 곳을 받치는 잔디 바닥 — 구역보다 살짝 아래에 둔다 */
const BASE_SIZE = 4000
const BASE_Y = -0.05
/** 마스크 한 칸 크기의 역수(칸/m)와, 걸을 수 있는 곳을 찾아보는 최대 거리 */
const PIXELS_PER_M = RESOLUTION / CHUNK
const WALK_SEARCH_M = 150
/** 막힌 곳 가장자리에서 안쪽으로 들어가 보는 거리 — 차도 옆 인도 폭이라 인도 위에 서고, 그보다 좁은 틈이면 그 폭의 가운데에 선다 */
const WALK_INSET_M = 1

export interface GroundStream {
  /** 처음 자리 둘레 구역을 모두 깐다 */
  prime(x: number, z: number): Promise<void>
  /** 매 프레임 — 캐릭터가 다른 구역으로 넘어가면 앞쪽을 깔고 멀어진 구역을 치운다 */
  update(x: number, z: number): void
  /**
   * 가장 가까운 걸을 수 있는 곳 — 화면에 그린 막힌 곳(차도)만 피한다. 잔디·공터·광장·인도 위면 그 자리를, 차도 위면
   * 가장 가까운 칸에서 같은 방향으로 인도 폭(1m)까지 들어가 본 그 폭의 가운데 자리를 돌려준다.
   * 그 자리 구역이 아직 안 깔렸거나 150m 안에 없으면 null
   */
  nearestWalk(x: number, z: number): { x: number; z: number } | null
  dispose(): void
}

interface GroundChunk {
  mesh: THREE.Mesh
  /** RGBA 마스크(r 차도 · b 인도·보행로·광장) — 막힌 곳(차도)을 피해 설 곳을 찾을 때 읽는다 */
  masks: Uint8Array
  dispose(): void
}

/**
 * 구역 마스크를 그려 주는 곳 — 워커가 있으면 워커에 맡기고(타일 해석·그리기가 메인 스레드를
 * 막지 않는다), 없거나 워커를 띄우지 못하면 메인 스레드에서 그린다.
 */
function createPainter(frame: LocalFrame, signal: AbortSignal): GroundSource & { dispose(): void } {
  let local: GroundSource | null = null
  const onMainThread = () => {
    local ??= createGroundSource(frame, document.createElement('canvas').getContext('2d', { willReadFrequently: true })!, signal)
    return local
  }
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return { build: (cx, cz) => onMainThread().build(cx, cz), dispose() {} }
  }

  let worker: Worker | null = new Worker(new URL('./ground.worker.ts', import.meta.url), { type: 'module' })
  let nextId = 0
  const pending = new Map<number, { cx: number; cz: number; resolve(pixels: GroundPixels): void; reject(error: Error): void }>()
  const post = (message: GroundWorkerRequest) => worker?.postMessage(message)
  post({ type: 'init', lng0: frame.lng0, lat0: frame.lat0 })
  worker.onmessage = (event: MessageEvent<GroundWorkerResponse>) => {
    const response = event.data
    const job = pending.get(response.id)
    if (!job) return
    pending.delete(response.id)
    if ('error' in response) job.reject(new Error(response.error))
    else job.resolve(response)
  }
  // 워커 스크립트를 못 띄웠다 — 기다리던 구역부터 메인 스레드로 넘긴다
  worker.onerror = () => {
    worker?.terminate()
    worker = null
    for (const job of pending.values()) onMainThread().build(job.cx, job.cz).then(job.resolve, job.reject)
    pending.clear()
  }

  return {
    build(cx, cz) {
      if (!worker) return onMainThread().build(cx, cz)
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { cx, cz, resolve, reject })
        post({ type: 'build', id, cx, cz })
      })
    },
    dispose() {
      worker?.terminate()
      worker = null
      for (const job of pending.values()) job.reject(new Error('disposed'))
      pending.clear()
    },
  }
}

/**
 * 걷는 만큼 이어지는 내 주변 바닥. 한 변 256m 구역을 캐릭터 둘레 3×3으로 깔고, 다른 구역으로
 * 넘어가면 앞줄을 새로 깔며 두 칸 넘게 멀어진 구역은 치운다. 마스크는 워커가 그려 보내고,
 * 여기서는 텍스처를 만들어 원작 지형 셰이더에 꽂는다.
 */
export function createGroundStream({
  scene,
  frame,
  textures,
  shared,
  signal,
}: {
  scene: THREE.Scene
  frame: LocalFrame
  textures: { ramp: THREE.Texture; noises: THREE.Texture; details: THREE.Texture }
  shared: SharedUniforms
  signal: AbortSignal
}): GroundStream {
  const painter = createPainter(frame, signal)
  const geometry = new THREE.PlaneGeometry(CHUNK, CHUNK).rotateX(-Math.PI / 2)
  const chunks = new Map<string, GroundChunk | 'loading'>()
  const queue: [number, number][] = []
  let building = false
  let current = ''
  let disposed = false

  // 잔디만 있는 받침 바닥 — 빈 마스크(전부 0)면 지형 셰이더가 잔디만 칠한다
  const blankMasks = dataTexture(new Uint8Array(4), 1, THREE.RGBAFormat)
  const blankMarks = dataTexture(new Uint8Array(1), 1, THREE.RedFormat)
  const baseMaterial = createTerrainMaterial({ ...textures, road: blankMarks, masks: blankMasks }, shared)
  const baseGeometry = new THREE.PlaneGeometry(BASE_SIZE, BASE_SIZE).rotateX(-Math.PI / 2)
  const base = new THREE.Mesh(baseGeometry, baseMaterial)
  base.position.y = BASE_Y
  base.receiveShadow = true
  scene.add(base)

  function createChunk(pixels: GroundPixels, cx: number, cz: number): GroundChunk {
    const masks = dataTexture(pixels.masks, RESOLUTION, THREE.RGBAFormat)
    const marks = dataTexture(pixels.marks, RESOLUTION, THREE.RedFormat)
    const material = createTerrainMaterial({ ...textures, road: marks, masks }, shared)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'ground'
    mesh.position.set((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK)
    mesh.receiveShadow = true
    return {
      mesh,
      masks: pixels.masks,
      dispose() {
        material.dispose()
        masks.dispose()
        marks.dispose()
      },
    }
  }

  async function build(cx: number, cz: number) {
    const key = `${cx},${cz}`
    // 줄 서 있는 사이 멀어져 치워졌으면 그리지 않는다
    if (disposed || chunks.get(key) !== 'loading') return
    const pixels = await painter.build(cx, cz)
    // 그리는 사이 멀어져 치워졌으면 버린다
    if (disposed || chunks.get(key) !== 'loading') return
    const chunk = createChunk(pixels, cx, cz)
    chunks.set(key, chunk)
    scene.add(chunk.mesh)
  }

  /** 한 번에 한 구역씩 그린다 — 경계를 넘을 때 한 프레임에 몰려 멈칫하지 않게 */
  function pump() {
    if (building || disposed) return
    const next = queue.shift()
    if (!next) return
    building = true
    build(next[0], next[1])
      .catch(() => chunks.delete(`${next[0]},${next[1]}`)) // 다음에 그 구역에 들어오면 다시 깐다
      .finally(() => {
        building = false
        pump()
      })
  }

  function around(cx: number, cz: number) {
    for (const [key, chunk] of chunks) {
      const [kx, kz] = key.split(',').map(Number)
      if (Math.max(Math.abs(kx - cx), Math.abs(kz - cz)) <= KEEP_RING) continue
      if (chunk !== 'loading') {
        scene.remove(chunk.mesh)
        chunk.dispose()
      }
      chunks.delete(key)
    }
    // 가까운 구역부터 깐다
    const wanted: [number, number][] = []
    for (let dz = -LOAD_RING; dz <= LOAD_RING; dz++) {
      for (let dx = -LOAD_RING; dx <= LOAD_RING; dx++) {
        if (!chunks.has(`${cx + dx},${cz + dz}`)) wanted.push([cx + dx, cz + dz])
      }
    }
    wanted.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz))
    for (const [x, z] of wanted) {
      chunks.set(`${x},${z}`, 'loading')
      queue.push([x, z])
    }
    base.position.x = (cx + 0.5) * CHUNK
    base.position.z = (cz + 0.5) * CHUNK
  }

  const cellOf = (x: number, z: number) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)] as const

  /**
   * 세계 칸(gx, gz — 구역 경계가 칸 경계와 맞는다)이 걸을 수 있는 곳인가. 차도(r)가 아니면 잔디·공터·광장·인도 모두 걷는다.
   * 마스크 첫 줄은 남쪽 끝이라 구역 안 줄을 뒤집어 읽는다. 안 깔린 구역은 null
   */
  function walkable(gx: number, gz: number): boolean | null {
    const cx = Math.floor(gx / RESOLUTION)
    const cz = Math.floor(gz / RESOLUTION)
    const chunk = chunks.get(`${cx},${cz}`)
    if (!chunk || chunk === 'loading') return null
    const col = gx - cx * RESOLUTION
    const row = RESOLUTION - 1 - (gz - cz * RESOLUTION)
    return chunk.masks[(row * RESOLUTION + col) * 4] < 128
  }

  return {
    nearestWalk(x, z) {
      const gx = Math.floor(x * PIXELS_PER_M)
      const gz = Math.floor(z * PIXELS_PER_M)
      const here = walkable(gx, gz)
      if (here === null) return null
      if (here) return { x, z }
      // 둘레를 한 겹씩 넓혀 가며 찾는다 — 처음 찾은 겹보다 바깥에서도 대각선 쪽이 더 가까울 수 있어 그 거리까지는 더 본다
      let best = Infinity
      let bx = 0
      let bz = 0
      const consider = (px: number, pz: number) => {
        const dist = Math.hypot(px - gx, pz - gz)
        if (dist < best && walkable(px, pz)) {
          best = dist
          bx = px
          bz = pz
        }
      }
      const limit = WALK_SEARCH_M * PIXELS_PER_M
      for (let r = 1; r <= limit && r <= best; r++) {
        for (let d = -r; d <= r; d++) {
          consider(gx + d, gz - r)
          consider(gx + d, gz + r)
        }
        for (let d = 1 - r; d < r; d++) {
          consider(gx - r, gz + d)
          consider(gx + r, gz + d)
        }
      }
      if (best === Infinity) return null
      // 가장자리 칸에서 같은 방향으로 더 들어가 인도 위에 세운다 — 가장자리에 서면 몸이 차도에 걸친다
      const ux = (bx - gx) / best
      const uz = (bz - gz) / best
      let inside = 0
      while (inside < WALK_INSET_M * PIXELS_PER_M && walkable(Math.round(bx + ux * (inside + 1)), Math.round(bz + uz * (inside + 1)))) {
        inside++
      }
      return { x: (bx + 0.5 + (ux * inside) / 2) / PIXELS_PER_M, z: (bz + 0.5 + (uz * inside) / 2) / PIXELS_PER_M }
    },

    async prime(x, z) {
      const [cx, cz] = cellOf(x, z)
      current = `${cx},${cz}`
      around(cx, cz)
      // 처음에는 순서대로 그릴 필요 없이 한꺼번에 맡긴다
      const first = queue.splice(0)
      await Promise.all(first.map(([qx, qz]) => build(qx, qz)))
    },

    update(x, z) {
      const [cx, cz] = cellOf(x, z)
      const key = `${cx},${cz}`
      if (key !== current) {
        current = key
        around(cx, cz)
      }
      pump()
    },

    dispose() {
      disposed = true
      painter.dispose()
      for (const chunk of chunks.values()) {
        if (chunk === 'loading') continue
        scene.remove(chunk.mesh)
        chunk.dispose()
      }
      chunks.clear()
      queue.length = 0
      scene.remove(base)
      baseGeometry.dispose()
      baseMaterial.dispose()
      blankMasks.dispose()
      blankMarks.dispose()
      geometry.dispose()
    },
  }
}

function dataTexture(data: Uint8Array<ArrayBuffer>, size: number, format: THREE.PixelFormat) {
  const texture = new THREE.DataTexture(data, size, size, format)
  texture.colorSpace = THREE.NoColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
