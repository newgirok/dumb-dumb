import * as THREE from 'three'
import { createSpacedCurvePoints, createVertexAnimation } from '@/lib/three/binLoader'
import { createBirdMaterial, type SharedUniforms } from './rampShader'
import { sineNoise1 } from './noise'

/**
 * 갈매기 떼 — 원본 birds의 GPGPU 비행 계산을 CPU로 옮겼다(25마리라 CPU가 더 단순하다).
 *
 * 원본은 32폭 계산 텍스처 첫 줄에 25마리를 놓고 가로 위치를 5등분해 무리를 나눈다
 * (그래서 실제로는 6·7·6·6마리 네 무리다). 무리마다 곡선 위를 도는 목표점이 있고,
 * 새는 그 점을 아주 약하게 끌려가며 사인 노이즈로 흩날리고 마찰로 느려진다.
 * 새는 속도 반대 방향(이전 위치 − 현재 위치)을 기준으로 몸을 돌린다.
 */

const BIRD_COUNT = 25
/** 원본 계산 텍스처 한 변 = ceilPowerOfTwo(25) */
const TEXTURE_SIZE = 32
const GROUPS = 5
/** 목표점으로 끌리는 세기·노이즈 세기·프레임당 마찰(원본 셰이더 상수, 60fps 기준) */
const ATTRACTION = 0.000275
const NOISE_AMOUNT = 0.005
const FRICTION = 0.99

function fract(x: number): number {
  return x - Math.floor(x)
}

/** GLSL mod — 음수에서도 [0, y) */
function mod(x: number, y: number): number {
  return x - y * Math.floor(x / y)
}

/** 원본 hash11 */
function hash11(p: number): number {
  p = fract(p * 0.1031)
  p *= p + 33.33
  p *= p + p
  return fract(p)
}

export interface Birds {
  mesh: THREE.InstancedMesh
  /** dt 초, ratio = dt×60(원본 dtRatio) */
  update(dt: number, ratio: number): void
  dispose(): void
}

export function createBirds(
  birdSource: THREE.BufferGeometry,
  curveSource: THREE.BufferGeometry,
  shared: SharedUniforms,
): Birds {
  const anim = createVertexAnimation(birdSource)
  const material = createBirdMaterial(anim.uniforms, shared)
  const mesh = new THREE.InstancedMesh(anim.geometry, material, BIRD_COUNT)
  const rand = new Float32Array(BIRD_COUNT * 4)
  for (let i = 0; i < rand.length; i++) rand[i] = Math.random()
  mesh.geometry.setAttribute('rand', new THREE.InstancedBufferAttribute(rand, 4, false, 1))
  mesh.name = 'birds'
  mesh.frustumCulled = false

  const curve = createSpacedCurvePoints(curveSource)
  const width = curve.length

  // 새마다 무리(가로 위치 기준 5등분)와 무리별 속도·출발 지점
  const groups = Array.from({ length: BIRD_COUNT }, (_, i) =>
    Math.floor(((i % TEXTURE_SIZE) + 0.5) / TEXTURE_SIZE * GROUPS),
  )
  const speeds = groups.map((g) => {
    const hash = hash11(g)
    const direction = Math.floor(hash * 2) === 0 ? -1 : 1
    return 2 * direction * (0.75 + 0.25 * hash)
  })

  const positions = Array.from({ length: BIRD_COUNT }, () => new THREE.Vector3())
  const previous = Array.from({ length: BIRD_COUNT }, () => new THREE.Vector3())
  const velocities = Array.from({ length: BIRD_COUNT }, () => new THREE.Vector3())
  // 원본 속도 텍스처 알파 — 새마다 다른 노이즈 위상
  const phases = Array.from({ length: BIRD_COUNT }, () => Math.random())
  let time = 0

  const target = new THREE.Vector3()
  function curveTarget(i: number, out: THREE.Vector3): THREE.Vector3 {
    const progress = time * speeds[i] + (width / GROUPS) * groups[i]
    const a = curve[Math.floor(mod(progress, width))]
    const b = curve[Math.floor(mod(progress + 1, width))]
    return out.copy(a).lerp(b, fract(progress))
  }

  // 원본 snap — 새를 자기 무리 목표점에 세우고 멈춘 채로 시작한다
  for (let i = 0; i < BIRD_COUNT; i++) {
    curveTarget(i, positions[i])
    previous[i].copy(positions[i])
  }

  const dir = new THREE.Vector3()
  const rotX = new THREE.Matrix4()
  const matrix = new THREE.Matrix4()
  const place = () => {
    for (let i = 0; i < BIRD_COUNT; i++) {
      dir.subVectors(previous[i], positions[i])
      if (dir.lengthSq() > 0) {
        dir.normalize()
        matrix.makeRotationY(Math.atan2(dir.x, dir.z)).multiply(rotX.makeRotationX(-dir.y))
      }
      matrix.setPosition(positions[i])
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
  place()

  return {
    mesh,
    update(dt, ratio) {
      const noise = NOISE_AMOUNT * ratio
      const friction = Math.pow(FRICTION, ratio)
      for (let i = 0; i < BIRD_COUNT; i++) {
        const p = positions[i]
        const v = velocities[i]
        // 원본 GPGPU처럼 이번 프레임 계산은 모두 이전 프레임 값으로 한다
        const oldVx = v.x
        const oldVy = v.y
        const oldVz = v.z
        const w = phases[i]
        const o1 = w * 12.245243 + time * 0.05
        const o2 = w * 532.564 + time * 0.1
        const o3 = w * 645653.34523 + time * 0.025
        v.x += sineNoise1(p.x + o1, p.y + o1, p.z + o1) * noise
        v.y += sineNoise1(p.x + o2, p.y + o2, p.z + o2) * noise
        v.z += sineNoise1(p.x + o3, p.y + o3, p.z + o3) * noise
        curveTarget(i, target)
        v.x += (target.x - p.x) * ATTRACTION * ratio
        v.y += (target.y - p.y) * ATTRACTION * ratio
        v.z += (target.z - p.z) * ATTRACTION * ratio
        v.multiplyScalar(friction)
        previous[i].copy(p)
        p.x += oldVx * ratio
        p.y += oldVy * ratio
        p.z += oldVz * ratio
      }
      time += dt
      place()
    },
    dispose() {
      material.dispose()
    },
  }
}
