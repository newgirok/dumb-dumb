import mapboxgl from 'mapbox-gl'
import { isSupported as isMapboxSupported } from '@mapbox/mapbox-gl-supported'
import * as THREE from 'three'

export interface WorldContext {
  map: mapboxgl.Map
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  camera: THREE.Camera
  /** lng/lat → Mercator 위치에 Object3D를 scene에 추가 */
  addAt: (obj: THREE.Object3D, lng: number, lat: number) => void
  /** lng/lat → 기존 Object3D 위치 갱신 */
  moveTo: (obj: THREE.Object3D, lng: number, lat: number) => void
}

// 1미터 → Mercator 좌표 단위 변환 계수 (위도 보정 포함)
function meterToMercator(lat: number): number {
  return 1 / (2 * Math.PI * 6371008 * Math.cos((lat * Math.PI) / 180))
}

function toMercator(lng: number, lat: number) {
  const mc = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0)
  return { x: mc.x, y: mc.y, z: mc.z ?? 0, scale: meterToMercator(lat) }
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
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom: 18,
      pitch: 45,
      bearing: 45,
      antialias: true,
    })

    const scene = new THREE.Scene()
    const camera = new THREE.Camera()
    camera.matrixAutoUpdate = false

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
              const { x, y, z, scale } = toMercator(lng, lat)
              obj.position.set(x, y, z)
              obj.scale.setScalar(scale)
              scene.add(obj)
            },
            moveTo(obj, lng, lat) {
              const { x, y, z } = toMercator(lng, lat)
              obj.position.set(x, y, z)
            },
          })
        }
      },

      render(_gl, args: unknown) {
        const matrix =
          (args as { defaultProjectionData?: { mainMatrix: number[] } })
            .defaultProjectionData?.mainMatrix ??
          (args as { projectionData?: { mainMatrix: number[] } })
            .projectionData?.mainMatrix

        if (matrix) {
          camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix)
        }
        renderer.resetState()
        renderer.render(scene, camera)
        map.triggerRepaint()
      },
    }

    map.on('load', () => {
      // dark-v11의 기본 'building' 레이어는 fill(평면)이라 건물이 전부 납작하게
      // 보임 — 평면 레이어는 숨기고, 같은 소스의 height/min_height 데이터로
      // fill-extrusion 3D 건물 레이어를 새로 추가
      map.setLayoutProperty('building', 'visibility', 'none')
      map.addLayer({
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'composite',
        'source-layer': 'building',
        minzoom: 15,
        filter: [
          'all',
          ['!=', ['get', 'type'], 'building:part'],
          ['==', ['get', 'underground'], 'false'],
        ],
        paint: {
          'fill-extrusion-color': 'hsl(0, 0%, 18%)',
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 5],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.9,
        },
      })

      map.addLayer(customLayer)
    })
  })
}
