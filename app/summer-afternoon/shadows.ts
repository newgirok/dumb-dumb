import * as THREE from 'three'
import { CSM_LEVELS, type SharedUniforms } from './rampShader'

/**
 * 원본 followCSMLight — 그림자를 두 겹으로 그린다.
 *
 * - 동적: 방향광 그림자맵 2048²가 카메라 시선 앞 ±12m만 덮으며 매 프레임 따라간다.
 *   (텍셀 1.17cm라 캐릭터·전선 같은 가는 그림자가 또렷하다.)
 * - 정적(CSM): 로딩이 끝날 때 월드 전체를 위에서 한 번 구워 둔다(8192², LOD 단계마다
 *   한 장). 동적 그림자 중심에서 9~12m 사이에서 정적 그림자로 넘어가므로 멀리 있는
 *   나무·집도 그림자를 드리운다. 한 번만 굽기 때문에 움직이는 것(캐릭터·새)은 빠진다.
 */

/** 원본 positionOffset = Spherical(100, 0.2π, -1.75π) → (41.6, 80.9, 41.6) */
const LIGHT_PHI = Math.PI * 0.2
const LIGHT_THETA = Math.PI * -1.75
/** 동적 그림자 반경(원본 shadowSize 12)과 맵 크기(원본 shadowMapSize 2048) */
export const SHADOW_SIZE = 12
const SHADOW_MAP = 2048
/** 시선 목표점에서 시선 방향으로 이만큼 민 곳을 동적 그림자 중심으로 둔다(원본 forwardOffset 6) */
const FORWARD_OFFSET = 6
/** 원본 csmBiases.x — 동적 그림자 normalBias와 정적 그림자 좌표 오프셋이 같은 값을 쓴다 */
const NORMAL_BIAS = 0.07
/** 정적 그림자 카메라 near(원본 csmNear 50) */
const CSM_NEAR = 50
/** 정적 그림자를 구울 때만 켜는 레이어(원본 cameraLayer 30) */
const CSM_LAYER = 30

export interface SunLight {
  light: THREE.DirectionalLight
  /** 매 프레임 — 카메라 위치와 시선 목표점으로 동적 그림자 중심을 옮긴다 */
  follow(cameraPosition: THREE.Vector3, lookTarget: THREE.Vector3): void
  /** 해상도를 낮춘 상태(원본 adaptiveMultiplier < 0.9)면 동적 그림자맵을 절반으로 쓴다 */
  setReduced(reduced: boolean): void
}

export function createSunLight(scene: THREE.Scene, shared: SharedUniforms): SunLight {
  const light = new THREE.DirectionalLight(0xffffff, 1)
  light.castShadow = true
  light.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP)
  const cam = light.shadow.camera
  cam.left = -SHADOW_SIZE
  cam.right = SHADOW_SIZE
  cam.top = SHADOW_SIZE
  cam.bottom = -SHADOW_SIZE
  cam.updateProjectionMatrix()
  light.shadow.normalBias = NORMAL_BIAS
  scene.add(light)
  scene.add(light.target)

  const offset = new THREE.Vector3().setFromSphericalCoords(100, LIGHT_PHI, LIGHT_THETA)
  const dir = new THREE.Vector3()

  return {
    light,
    follow(cameraPosition, lookTarget) {
      dir.subVectors(lookTarget, cameraPosition).normalize()
      light.target.position.copy(lookTarget).addScaledVector(dir, FORWARD_OFFSET)
      light.target.updateMatrixWorld()
      light.position.copy(light.target.position).add(offset)
      shared.csmTarget.value.copy(light.target.position)
    },
    setReduced(reduced) {
      const size = reduced ? SHADOW_MAP / 2 : SHADOW_MAP
      if (light.shadow.mapSize.x === size) return
      light.shadow.mapSize.set(size, size)
      light.shadow.map?.dispose()
      light.shadow.map = null
    },
  }
}

/**
 * 정적 그림자(CSM)를 굽는다 — 그림자를 드리우는 메시를 깊이 재질로 바꿔 월드 전체를
 * 위에서 한 번 그린다. LOD는 단계마다 그 단계만 보이게 해서 따로 굽는다(오브젝트는
 * 자기 LOD 단계와 같은 맵을 읽어 자기 그림자와 형태가 어긋나지 않는다).
 *
 * 깊이 버퍼가 필요한 건 굽는 순간뿐이라 임시 타깃 하나로 그린 뒤 색만 텍스처로
 * 복사한다(원본은 맵마다 깊이 버퍼를 들고 있다 — 결과는 같고 메모리만 줄인다).
 */
export function bakeStaticShadows({
  renderer,
  scene,
  shared,
  bounds,
  skip,
  mobile,
}: {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  shared: SharedUniforms
  /** 월드를 덮는 구 — 원본은 collider의 바운딩 스피어를 쓴다 */
  bounds: THREE.Sphere
  /** 굽지 않을 오브젝트(원본 skipCSMMeshes — 캐릭터·하늘·바다·새) */
  skip: THREE.Object3D[]
  mobile: boolean
}): THREE.Texture[] {
  const size = Math.min(mobile ? 4096 : 8192, renderer.capabilities.maxTextureSize)
  const radius = Math.max(100, bounds.radius)
  const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, CSM_NEAR, radius * 2 - CSM_NEAR)
  camera.position
    .setFromSphericalCoords(radius, LIGHT_PHI, LIGHT_THETA)
    .add(bounds.center)
  camera.lookAt(bounds.center)
  camera.updateMatrixWorld()
  camera.layers.set(CSM_LAYER)

  shared.csmMatrix.value
    .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    .multiply(camera.projectionMatrix)
    .multiply(camera.matrixWorldInverse)
  shared.csmOptions.value.set(size, 1, SHADOW_SIZE * 0.75, SHADOW_SIZE)

  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
  const lods: THREE.LOD[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && mesh.castShadow && !skip.includes(mesh) && (mesh.visible || mesh.parent instanceof THREE.LOD)) {
      swapped.push([mesh, mesh.material])
      mesh.material = mesh.customDepthMaterial ?? depthMaterial
      mesh.layers.enable(CSM_LAYER)
    }
    if (o instanceof THREE.LOD) lods.push(o)
  })
  const lodAutoUpdate = lods.map((lod) => lod.autoUpdate)
  const lodVisible = lods.map((lod) => lod.levels.map((l) => l.object.visible))
  for (const lod of lods) lod.autoUpdate = false

  const prevTarget = renderer.getRenderTarget()
  const prevAutoClear = renderer.autoClear
  const prevClearColor = renderer.getClearColor(new THREE.Color())
  const prevClearAlpha = renderer.getClearAlpha()
  const temp = new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  })
  renderer.autoClear = false
  renderer.setClearColor('#ffffff', 1)

  const maps: THREE.Texture[] = []
  const origin = new THREE.Vector2()
  for (let level = 0; level < CSM_LEVELS; level++) {
    for (const lod of lods) lod.levels.forEach((l, i) => (l.object.visible = i === level))
    renderer.setRenderTarget(temp)
    renderer.clear(true, true, false)
    renderer.render(scene, camera)
    const map = new THREE.FramebufferTexture(size, size)
    renderer.copyFramebufferToTexture(map, origin)
    maps.push(map)
    shared.csmMaps[level].value = map
  }

  renderer.setRenderTarget(prevTarget)
  renderer.autoClear = prevAutoClear
  renderer.setClearColor(prevClearColor, prevClearAlpha)
  temp.dispose()
  depthMaterial.dispose()
  for (const [mesh, material] of swapped) {
    mesh.material = material
    mesh.layers.disable(CSM_LAYER)
  }
  lods.forEach((lod, i) => {
    lod.autoUpdate = lodAutoUpdate[i]
    lod.levels.forEach((l, k) => (l.object.visible = lodVisible[i][k]))
  })
  return maps
}
