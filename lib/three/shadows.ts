import * as THREE from 'three'
import { CSM_LEVELS, type SharedUniforms } from './ramp-shader'
import { compileGradually, settle } from './warm-up'

/**
 * 원본 followCSMLight — 그림자를 두 겹으로 그린다.
 *
 * - 동적: 방향광 그림자맵 2048²가 카메라 시선 앞 ±12m만 덮으며 매 프레임 따라간다.
 *   (텍셀 1.17cm라 캐릭터·전선 같은 가는 그림자가 또렷하다.)
 * - 정적(CSM): 로딩이 끝날 때 월드 전체를 위에서 한 번 구워 둔다(4096², LOD 단계마다
 *   한 장). 동적 그림자 중심에서 9~12m 사이에서 정적 그림자로 넘어가므로 멀리 있는
 *   나무·집도 그림자를 드리운다. 한 번만 굽기 때문에 움직이는 것(캐릭터·새)은 빠진다.
 *   원본은 데스크톱 8192²이지만, 8192² 타깃은 잡는 것만으로 내장 GPU에서 0.4초쯤 화면 합성을
 *   멈춰 로더 스피너가 끊긴다 — 모바일과 같은 4096²로 굽되, 1024² 조각으로 나눠 조각마다 GPU가
 *   끝낼 때까지 쉰다.
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
/** 정적 그림자맵 크기 — 원본 모바일 값(데스크톱 원본은 8192) */
const CSM_MAP = 4096
/** 정적 그림자를 이 크기 조각으로 나눠 굽는다 — 4096² 타깃을 한 번에 잡고 그리면 내장 GPU가 50~80ms 멈춰 로더 스피너가 끊긴다 */
const BAKE_TILE = 1024

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

/** three(WebGLShadowMap)가 재질에 shadowSide가 없을 때 고르는 그림자 면 */
const SHADOW_SIDE: Record<THREE.Side, THREE.Side> = {
  [THREE.FrontSide]: THREE.BackSide,
  [THREE.BackSide]: THREE.FrontSide,
  [THREE.DoubleSide]: THREE.DoubleSide,
}

type DepthSource = THREE.Material &
  Partial<Pick<THREE.MeshLambertMaterial, 'map' | 'alphaMap' | 'displacementMap' | 'displacementScale' | 'displacementBias' | 'wireframe'>>

/**
 * 동적 그림자(방향광 그림자맵)가 처음 그려질 때 컴파일할 깊이 셰이더를 로더 뒤에서 미리 나눠 컴파일한다.
 * three(WebGLShadowMap)는 RGBA 깊이 재질에 원래 재질의 면(shadowSide, 없으면 반대 면)·맵·알파 테스트·
 * 변위·클리핑을 옮겨 그리므로, 같은 속성의 깊이 재질로 컴파일해야 같은 프로그램을 다시 쓴다.
 * 돌려준 재질은 씬을 치울 때 dispose한다 — 먼저 dispose하면 미리 만든 프로그램도 함께 지워진다
 */
export async function compileShadowDepth(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  target: THREE.WebGLRenderTarget,
  cancelled: () => boolean,
): Promise<THREE.Material[]> {
  const depthFor = new Map<THREE.Material, THREE.MeshDepthMaterial>()
  const swapped: [THREE.Mesh, THREE.Material][] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.castShadow || Array.isArray(mesh.material)) return
    const source = mesh.material as DepthSource
    let depth = depthFor.get(source)
    if (!depth) {
      depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
      depth.side = source.shadowSide ?? SHADOW_SIDE[source.side]
      depth.map = source.map ?? null
      depth.alphaMap = source.alphaMap ?? null
      depth.alphaTest = source.alphaTest
      depth.displacementMap = source.displacementMap ?? null
      depth.displacementScale = source.displacementScale ?? 1
      depth.displacementBias = source.displacementBias ?? 0
      depth.clipShadows = source.clipShadows
      depth.clippingPlanes = source.clippingPlanes
      depth.clipIntersection = source.clipIntersection
      depth.wireframe = source.wireframe ?? false
      depthFor.set(source, depth)
    }
    swapped.push([mesh, source])
    mesh.material = depth
  })
  try {
    await compileGradually(renderer, scene, camera, target, cancelled)
  } finally {
    for (const [mesh, material] of swapped) mesh.material = material
  }
  return [...depthFor.values()]
}

/**
 * 정적 그림자(CSM)를 굽는다 — 그림자를 드리우는 메시를 깊이 재질로 바꿔 월드 전체를
 * 위에서 한 번 그린다. LOD는 단계마다 그 단계만 보이게 해서 따로 굽는다(오브젝트는
 * 자기 LOD 단계와 같은 맵을 읽어 자기 그림자와 형태가 어긋나지 않는다).
 *
 * 깊이 버퍼가 필요한 건 굽는 순간뿐이라 조각 크기(1024²) 임시 타깃 하나에 조각마다 그 부분만 보는
 * 카메라(setViewOffset)로 그린 뒤 색만 맵의 같은 자리로 복사한다(원본은 맵마다 깊이 버퍼를 들고 한 번에
 * 그린다 — 결과는 같고 메모리만 줄인다). 로더 스피너가 끊기지 않게 깊이 재질을 먼저 나눠 컴파일하고,
 * 맵을 잡은 뒤와 조각마다 GPU가 끝낼 때까지 기다린다. 굽는 동안에는 동적 그림자를 함께 그리지 않는다.
 *
 * 굽는 동안 씬의 빛도 굽기 레이어에 넣는다. 셰이더 프로그램은 빛 수로도 갈리고, three는 프레임마다
 * 그림자를 빛 상태를 갱신하기 전에 그려 첫 프레임 동적 그림자가 직전(굽기)의 빛 상태를 쓴다 —
 * 빛 조건이 화면과 같아야 굽기·첫 프레임이 로딩 때 만든 프로그램을 그대로 다시 쓴다.
 */
export async function bakeStaticShadows({
  renderer,
  scene,
  shared,
  bounds,
  skip,
  cancelled,
}: {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  shared: SharedUniforms
  /** 월드를 덮는 구 — 원본은 collider의 바운딩 스피어를 쓴다 */
  bounds: THREE.Sphere
  /** 굽지 않을 오브젝트(원본 skipCSMMeshes — 캐릭터·하늘·바다·새) */
  skip: THREE.Object3D[]
  /** true가 되면 남은 단계를 굽지 않고 재질만 되돌린다(씬이 사라졌다) */
  cancelled: () => boolean
}): Promise<THREE.Texture[]> {
  const size = Math.min(CSM_MAP, renderer.capabilities.maxTextureSize)
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
  const lights: THREE.Light[] = []
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight && !o.layers.isEnabled(CSM_LAYER)) {
      o.layers.enable(CSM_LAYER)
      lights.push(o as THREE.Light)
    }
  })
  const lodAutoUpdate = lods.map((lod) => lod.autoUpdate)
  const lodVisible = lods.map((lod) => lod.levels.map((l) => l.object.visible))
  for (const lod of lods) lod.autoUpdate = false

  const prevTarget = renderer.getRenderTarget()
  const prevAutoClear = renderer.autoClear
  const prevClearColor = renderer.getClearColor(new THREE.Color())
  const prevClearAlpha = renderer.getClearAlpha()
  const prevShadowAuto = renderer.shadowMap.autoUpdate
  const tile = Math.min(BAKE_TILE, size)
  const temp = new THREE.WebGLRenderTarget(tile, tile, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  })
  const gl = renderer.getContext()

  const maps: THREE.Texture[] = []
  try {
    await compileGradually(renderer, scene, camera, temp, cancelled)
    for (let level = 0; level < CSM_LEVELS && !cancelled(); level++) {
      for (const lod of lods) lod.levels.forEach((l, i) => (l.object.visible = i === level))
      const map = new THREE.FramebufferTexture(size, size)
      maps.push(map)
      renderer.initTexture(map)
      await settle(renderer)
      // 뷰 오프셋은 맵 위쪽부터, 프레임버퍼·텍스처 좌표는 아래쪽부터 센다
      for (let y = 0; y < size && !cancelled(); y += tile) {
        for (let x = 0; x < size && !cancelled(); x += tile) {
          camera.setViewOffset(size, size, x, y, tile, tile)
          renderer.shadowMap.autoUpdate = false
          renderer.autoClear = false
          renderer.setClearColor('#ffffff', 1)
          renderer.setRenderTarget(temp)
          renderer.clear(true, true, false)
          renderer.render(scene, camera)
          // copyFramebufferToTexture는 맵 크기 전체만 복사해서, 조각은 three의 텍스처 바인딩을 거쳐 직접 복사한다
          renderer.state.bindTexture(gl.TEXTURE_2D, (renderer.properties.get(map) as { __webglTexture: WebGLTexture }).__webglTexture)
          gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x, size - y - tile, 0, 0, tile, tile)
          renderer.state.unbindTexture()
          renderer.setRenderTarget(prevTarget)
          renderer.autoClear = prevAutoClear
          renderer.setClearColor(prevClearColor, prevClearAlpha)
          renderer.shadowMap.autoUpdate = prevShadowAuto
          await settle(renderer)
        }
      }
      shared.csmMaps[level].value = map
    }
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.autoClear = prevAutoClear
    renderer.setClearColor(prevClearColor, prevClearAlpha)
    renderer.shadowMap.autoUpdate = prevShadowAuto
    temp.dispose()
    depthMaterial.dispose()
    for (const [mesh, material] of swapped) {
      mesh.material = material
      mesh.layers.disable(CSM_LAYER)
    }
    for (const light of lights) light.layers.disable(CSM_LAYER)
    lods.forEach((lod, i) => {
      lod.autoUpdate = lodAutoUpdate[i]
      lod.levels.forEach((l, k) => (l.object.visible = lodVisible[i][k]))
    })
  }
  return maps
}
