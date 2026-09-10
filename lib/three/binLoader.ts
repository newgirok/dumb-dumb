import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

/**
 * ref-assets(.bin) 지오메트리 로더.
 *
 * 컨테이너 포맷:
 *   [0:10]        JSON 길이 (ASCII 십진수 + NUL 패딩)
 *   [10:10+n]     JSON 메타
 *   [10+n:]       표준 DRACO 페이로드
 *
 * 메타의 attributes는 [이름, 타입인덱스] 쌍이고, 배열 내 순서가 곧 DRACO
 * unique attribute ID다. type 0은 메시, type 1은 트랜스폼 데이터(본/인스턴스).
 */

const HEADER_BYTES = 10
const DRACO_PATH = '/ref-assets/libs/draco/'
const GEOMETRY_PATH = '/ref-assets/geometries/'

// 메타의 타입 인덱스 → TypedArray 생성자 이름. DRACOLoader 워커가
// self[이름]으로 조회하므로 문자열 그대로 넘긴다
const TYPED_ARRAYS = [
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
]

interface BinMeta {
  type: 0 | 1
  attributes: [string, number][]
  userData?: { fps: number; frames: number }
}

/** 프레임 수·fps는 애니메이션 .bin에만 들어있다 */
export interface AnimationUserData {
  fps: number
  frames: number
}

// decodeGeometry는 @types/three에 노출돼 있지 않지만 DRACOLoader의 실제 public
// 메서드다(three 0.169 DRACOLoader.js:106). 직접 쓰지 않으면 커스텀
// attributeIDs/useUniqueIDs를 넘길 방법이 없어 최소한의 형태로만 선언
interface DracoInternal {
  decodeGeometry(
    buffer: ArrayBuffer,
    taskConfig: {
      attributeIDs: Record<string, number>
      attributeTypes: Record<string, string>
      useUniqueIDs: boolean
    },
  ): Promise<THREE.BufferGeometry>
}

let loader: (DRACOLoader & DracoInternal) | null = null

function getLoader(): DRACOLoader & DracoInternal {
  if (!loader) {
    const l = new DRACOLoader()
    l.setDecoderPath(DRACO_PATH)
    l.preload()
    loader = l as DRACOLoader & DracoInternal
  }
  return loader
}

/** DRACOLoader 워커 정리 — 씬 언마운트 시 호출 */
export function disposeBinLoader(): void {
  loader?.dispose()
  loader = null
}

const cache = new Map<string, Promise<THREE.BufferGeometry>>()

/**
 * `name`은 확장자를 뺀 지오메트리 이름 (예: 'kid', 'kid-idle').
 * 같은 이름은 캐시된 Promise를 공유하므로 중복 요청·중복 디코딩이 없다.
 */
export function loadBinGeometry(name: string): Promise<THREE.BufferGeometry> {
  const cached = cache.get(name)
  if (cached) return cached

  const task = (async () => {
    const res = await fetch(`${GEOMETRY_PATH}${name}.bin`)
    if (!res.ok) throw new Error(`${name}.bin 로드 실패 (HTTP ${res.status})`)
    const buf = await res.arrayBuffer()

    const decoder = new TextDecoder()
    // parseInt는 NUL 패딩에서 멈추므로 별도 트리밍 불필요
    const jsonLength = parseInt(decoder.decode(buf.slice(0, HEADER_BYTES)), 10)
    if (!Number.isFinite(jsonLength)) throw new Error(`${name}.bin 헤더가 손상됨`)

    const meta: BinMeta = JSON.parse(
      decoder.decode(buf.slice(HEADER_BYTES, HEADER_BYTES + jsonLength)),
    )

    const attributeIDs: Record<string, number> = {}
    const attributeTypes: Record<string, string> = {}
    meta.attributes.forEach(([attrName, typeIndex], i) => {
      attributeIDs[attrName] = i
      attributeTypes[attrName] = TYPED_ARRAYS[typeIndex]
    })

    const geometry = await getLoader().decodeGeometry(
      buf.slice(HEADER_BYTES + jsonLength),
      { attributeIDs, attributeTypes, useUniqueIDs: true },
    )
    if (meta.userData) geometry.userData = meta.userData
    // 캐시가 소유하는 공유 지오메트리 표식 — 개별 오브젝트를 정리하는 쪽에서
    // 실수로 dispose하면 같은 지오메트리를 쓰는 다른 오브젝트까지 깨진다
    geometry.userData.shared = true
    return geometry
  })()

  cache.set(name, task)
  // 실패한 Promise가 캐시에 남아 영구 실패하지 않도록 정리
  task.catch(() => cache.delete(name))
  return task
}

/**
 * 스킨드 메시 조립.
 * `bones`는 type 1 지오메트리로, 점 하나가 본 하나다. hierarchy는 1-based
 * 부모 인덱스이고 0이 루트를 뜻한다.
 */
export function createSkin(
  geometry: THREE.BufferGeometry,
  bones: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.SkinnedMesh {
  const { position, quaternion, scale, hierarchy } = bones.attributes
  const boneList: THREE.Bone[] = []

  for (let i = 0; i < position.count; i++) {
    const bone = new THREE.Bone()
    bone.name = `bone_${i}`
    bone.position.fromArray(position.array, i * 3)
    bone.quaternion.fromArray(quaternion.array, i * 4).normalize()
    bone.scale.fromArray(scale.array, i * 3)
    boneList.push(bone)
  }

  const roots: number[] = []
  for (let i = 0; i < hierarchy.count; i++) {
    const parent = hierarchy.array[i] - 1
    if (parent === -1) roots.push(i)
    else boneList[parent].add(boneList[i])
  }

  const skeleton = new THREE.Skeleton(boneList)
  const mesh = new THREE.SkinnedMesh(geometry, material)
  roots.forEach((i) => mesh.add(skeleton.bones[i]))
  mesh.bind(skeleton)
  mesh.normalizeSkinWeights()
  return mesh
}

/**
 * 애니메이션 클립 조립.
 * 데이터는 프레임 우선(frame-major) 배치다 — 프레임 f, 본 b, 성분 c 순으로
 * [f * boneCount * itemSize + b * itemSize + c]에 들어있다.
 */
export function createSkinAnimation(
  name: string,
  clip: THREE.BufferGeometry,
): THREE.AnimationClip {
  const { fps, frames } = clip.userData as AnimationUserData
  const boneCount = clip.attributes.position.count / frames
  const duration = frames / fps
  const step = duration / (frames - 1)
  const times = Array.from({ length: frames }, (_, f) => f * step)

  const tracks: THREE.KeyframeTrack[] = []

  for (const prop of ['position', 'quaternion', 'scale'] as const) {
    const attr = clip.attributes[prop]
    const { itemSize } = attr

    for (let b = 0; b < boneCount; b++) {
      const values: number[] = []
      for (let f = 0; f < frames; f++) {
        const base = f * boneCount * itemSize + b * itemSize
        for (let c = 0; c < itemSize; c++) values.push(attr.array[base + c])
      }
      const Track =
        itemSize === 4 ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack
      tracks.push(
        new Track(`bone_${b}.${prop}`, times, values, THREE.InterpolateLinear),
      )
    }
  }

  return new THREE.AnimationClip(name, duration, tracks)
}

/**
 * 인스턴스 트랜스폼(type 1) → Matrix4 배열.
 * position/quaternion/scale은 파일마다 있을 수도 없을 수도 있고
 * (lightposts는 scale 없음, grass는 quaternion 없음), scale은 균일값 1개인
 * 경우와 축별 3개인 경우가 모두 있다.
 */
function readInstanceMatrices(instances: THREE.BufferGeometry): THREE.Matrix4[] {
  const { position, quaternion, scale } = instances.attributes
  const count = position.count

  const dummy = new THREE.Object3D()
  const matrices: THREE.Matrix4[] = []

  for (let i = 0; i < count; i++) {
    dummy.position.fromArray(position.array, i * 3)
    if (quaternion) dummy.quaternion.fromArray(quaternion.array, i * 4).normalize()
    else dummy.quaternion.identity()
    if (!scale) dummy.scale.setScalar(1)
    else if (scale.itemSize === 1) dummy.scale.setScalar(scale.array[i])
    else dummy.scale.fromArray(scale.array, i * 3)
    dummy.updateMatrix()
    matrices.push(dummy.matrix.clone())
  }

  return matrices
}

/** 소품 하나를 인스턴스 트랜스폼만큼 찍어낸 InstancedMesh */
export function createInstancedMesh(
  geometry: THREE.BufferGeometry,
  instances: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.InstancedMesh {
  const matrices = readInstanceMatrices(instances)
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

export interface LODLevel {
  geometry: THREE.BufferGeometry
  /** 이 레벨로 전환되는 거리(m) */
  distance: number
}

/**
 * LOD가 붙은 인스턴스 소품.
 *
 * THREE.LOD는 오브젝트 하나의 원점까지의 거리로 레벨을 고르기 때문에, 넓게
 * 흩어진 인스턴스를 InstancedMesh 하나로 묶으면 전부 같은 레벨이 된다.
 * 그래서 인스턴스를 격자로 묶어(patch) patch마다 LOD를 만든다 — 원본이
 * 최근접 이웃으로 patch를 만드는 것과 같은 목적이고, 격자 쪽이 훨씬 단순하다.
 *
 * 레벨 선택은 THREE.LOD가 카메라 위치로 판단하므로 매 프레임 update(camera)를
 * 호출해야 한다.
 */
export function createInstancedLOD(
  levels: LODLevel[],
  instances: THREE.BufferGeometry,
  material: THREE.Material,
  patchSize = 40,
): THREE.Group {
  const matrices = readInstanceMatrices(instances)
  const sorted = [...levels].sort((a, b) => a.distance - b.distance)

  const patches = new Map<string, THREE.Matrix4[]>()
  const pos = new THREE.Vector3()
  for (const m of matrices) {
    pos.setFromMatrixPosition(m)
    const key = `${Math.floor(pos.x / patchSize)},${Math.floor(pos.z / patchSize)}`
    const bucket = patches.get(key)
    if (bucket) bucket.push(m)
    else patches.set(key, [m])
  }

  const group = new THREE.Group()
  const centroid = new THREE.Vector3()
  const local = new THREE.Matrix4()
  const offset = new THREE.Matrix4()

  for (const bucket of patches.values()) {
    centroid.set(0, 0, 0)
    for (const m of bucket) centroid.add(pos.setFromMatrixPosition(m))
    centroid.divideScalar(bucket.length)

    const lod = new THREE.LOD()
    lod.position.copy(centroid)
    offset.makeTranslation(-centroid.x, -centroid.y, -centroid.z)

    for (const level of sorted) {
      const mesh = new THREE.InstancedMesh(level.geometry, material, bucket.length)
      bucket.forEach((m, i) => mesh.setMatrixAt(i, local.multiplyMatrices(offset, m)))
      mesh.instanceMatrix.needsUpdate = true
      lod.addLevel(mesh, level.distance)
    }

    group.add(lod)
  }

  return group
}
