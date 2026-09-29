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

export interface GroundStream {
  /** 처음 자리 둘레 구역을 모두 깐다 */
  prime(x: number, z: number): Promise<void>
  /** 매 프레임 — 캐릭터가 다른 구역으로 넘어가면 앞쪽을 깔고 멀어진 구역을 치운다 */
  update(x: number, z: number): void
  dispose(): void
}

interface GroundChunk {
  mesh: THREE.Mesh
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

  return {
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
