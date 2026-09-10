import mapboxgl from 'mapbox-gl'
import { isSupported as isMapboxSupported } from '@mapbox/mapbox-gl-supported'
import * as THREE from 'three'

export interface WorldContext {
  map: mapboxgl.Map
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  camera: THREE.Camera
  /** lng/lat → 씬 원점 기준 미터 좌표에 Object3D를 scene에 추가 */
  addAt: (obj: THREE.Object3D, lng: number, lat: number) => void
  /** lng/lat → 기존 Object3D 위치 갱신 */
  moveTo: (obj: THREE.Object3D, lng: number, lat: number) => void
}

// 1미터 → Mercator 좌표 단위 변환 계수 (위도 보정 포함)
function meterToMercator(lat: number): number {
  return 1 / (2 * Math.PI * 6371008 * Math.cos((lat * Math.PI) / 180))
}

/**
 * 씬 좌표계 — 오브젝트는 Mercator가 아니라 "원점 기준 미터"에 놓는다.
 *
 * Mercator 좌표(0~1)에 직접 놓고 scale을 3e-8로 주면, 정점 오프셋이 그 크기
 * 에서의 float32 엡실론보다 작아져 셰이더에서 MVP를 계산하는 순간 정점이
 * 이산 격자로 뭉개진다(메시가 조각나 보임). 그래서 원점 이동·스케일·축 변환을
 * 전부 카메라 projectionMatrix에 합성하고, 오브젝트는 원점 근처 미터 좌표에
 * 둬서 float32 정밀도 안에서 다룬다. Mapbox 공식 3D 모델 예제와 같은 방식.
 *
 * 축: three(Y-up, +X 동쪽, +Z 북쪽) → Mercator(+X 동쪽, +Y 남쪽, +Z 위쪽)
 * 변환은 X축 +90° 회전이 담당하므로 오브젝트는 평범한 Y-up으로 두면 된다.
 */
function createSceneOrigin(center: [number, number]) {
  const origin = mapboxgl.MercatorCoordinate.fromLngLat(center, 0)
  const scale = meterToMercator(center[1])

  // T(origin) · S(scale) · Rx(90°)
  const worldMatrix = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z ?? 0)
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))

  return {
    worldMatrix,
    /** lng/lat → 원점 기준 미터 좌표 (지면 높이 y=0) */
    toLocal(lng: number, lat: number): [number, number, number] {
      const mc = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0)
      // local = Rx(90°)⁻¹ · (Δmercator / scale) — Rx(-90°)는 (X,Y,Z)→(X,Z,-Y)
      return [(mc.x - origin.x) / scale, 0, -(mc.y - origin.y) / scale]
    },
  }
}

export function initWorldMap(
  container: HTMLElement,
  center: [number, number],
): Promise<WorldContext> {
  return new Promise((resolve, reject) => {
    if (!isMapboxSupported()) {
      reject(new Error('mapbox-gl-unsupported'))
      return
    }

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/standard',
      center,
      zoom: 17,
      pitch: 45,
      bearing: 45,
      antialias: true,
      // Mapbox/OSM 저작권 표기는 이용약관상 반드시 표시해야 함(완전 삭제 불가) —
      // 기본 컨트롤은 끄고 아래에서 compact 모드로 직접 추가해 최소화
      attributionControl: false,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))

    const scene = new THREE.Scene()
    const camera = new THREE.Camera()
    camera.matrixAutoUpdate = false
    const sceneOrigin = createSceneOrigin(center)

    let renderer: THREE.WebGLRenderer
    let resolved = false

    const customLayer: mapboxgl.CustomLayerInterface = {
      id: 'three-scene',
      type: 'custom',
      renderingMode: '3d',

      onAdd(m, gl) {
        renderer = new THREE.WebGLRenderer({
          canvas: m.getCanvas(),
          context: gl as WebGL2RenderingContext,
          antialias: true,
        })
        renderer.autoClear = false
        renderer.shadowMap.enabled = false

        scene.add(new THREE.AmbientLight(0xffffff, 0.7))
        const dir = new THREE.DirectionalLight(0xffffff, 0.8)
        dir.position.set(0, 10, 5)
        scene.add(dir)

        if (!resolved) {
          resolved = true
          resolve({
            map,
            scene,
            renderer,
            camera,
            addAt(obj, lng, lat) {
              obj.position.set(...sceneOrigin.toLocal(lng, lat))
              scene.add(obj)
            },
            moveTo(obj, lng, lat) {
              obj.position.set(...sceneOrigin.toLocal(lng, lat))
            },
          })
        }
      },

      // mapbox-gl v3의 CustomLayerRenderMethod는 두 번째 인자로 MVP 행렬
      // 배열을 그대로 넘긴다(gl, matrix, projection, ...). 이걸 객체로 보고
      // .defaultProjectionData.mainMatrix를 찾으면 항상 undefined라
      // projectionMatrix가 항등행렬로 남고, 씬 전체가 Mercator 좌표(0~1)를
      // NDC로 그대로 써서 서브픽셀 크기로 그려진다
      render(_gl, matrix: number[]) {
        // mapbox MVP · (원점 이동 · 미터 스케일 · 축 변환)
        camera.projectionMatrix.fromArray(matrix).multiply(sceneOrigin.worldMatrix)
        renderer.resetState()
        // 캐릭터는 1.5m라 주변 건물(20~30m)에 항상 가려진다. 이 레이어는
        // slot 'top' — 건물보다 위에 그리는 게 의도이므로, 색은 남기고
        // basemap이 남긴 깊이만 비워 캐릭터가 언제나 보이게 한다
        renderer.clearDepth()
        renderer.render(scene, camera)
        map.triggerRepaint()
      },
    }

    map.on('load', () => {
      // Standard 스타일은 3D 건물이 기본 내장(show3dBuildings)이라 dark-v11에서
      // 수동으로 추가하던 fill-extrusion 레이어가 더 이상 필요 없음. 대신 다크
      // 게임 톤에 맞춰 시간대 프리셋만 night로 고정
      map.setConfigProperty('basemap', 'lightPreset', 'night')

      // 건물·도로만 남기고 글자/아이콘류는 전부 끔 — 게임 화면을 어지럽히는
      // 지명·POI·교통 라벨과 아이콘 제거 (도로 자체 지오메트리는 유지됨)
      map.setConfigProperty('basemap', 'showPlaceLabels', false)
      map.setConfigProperty('basemap', 'showRoadLabels', false)
      map.setConfigProperty('basemap', 'showTransitLabels', false)
      map.setConfigProperty('basemap', 'showPointOfInterestLabels', false)
      map.setConfigProperty('basemap', 'showLandmarkIcons', false)
      map.setConfigProperty('basemap', 'showLandmarkIconLabels', false)

      // slot 'top' — 건물·라벨보다 위, 항상 위에 그려지는 이전(dark-v11) 동작과 동일하게 유지
      map.addLayer({ ...customLayer, slot: 'top' } as mapboxgl.CustomLayerInterface)
    })
  })
}
