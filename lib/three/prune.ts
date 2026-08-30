import * as THREE from 'three'

/** 반경 450m 바깥 오브젝트 dispose — 50m 이동마다 비동기 실행 */

const PRUNE_RADIUS_M = 450
const PRUNE_EVERY_M = 50

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach((m: THREE.Material) => m.dispose())
  })
}

export class PruneManager {
  private lastLng: number
  private lastLat: number

  constructor(lng: number, lat: number) {
    this.lastLng = lng
    this.lastLat = lat
  }

  /**
   * 게임 루프마다 호출.
   * pruneMap: userId → Object3D. userData.lng/lat이 설정되어 있어야 함.
   */
  tick(
    scene: THREE.Scene,
    playerLng: number,
    playerLat: number,
    pruneMap: Map<string, THREE.Object3D>,
  ): void {
    const moved = haversineM(this.lastLng, this.lastLat, playerLng, playerLat)
    if (moved < PRUNE_EVERY_M) return

    this.lastLng = playerLng
    this.lastLat = playerLat

    queueMicrotask(() => {
      for (const [id, obj] of pruneMap) {
        const { lng, lat } = obj.userData as { lng?: number; lat?: number }
        if (lng == null || lat == null) continue
        if (haversineM(playerLng, playerLat, lng, lat) > PRUNE_RADIUS_M) {
          disposeObject(obj)
          scene.remove(obj)
          pruneMap.delete(id)
        }
      }
    })
  }
}
