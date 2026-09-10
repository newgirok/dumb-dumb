import * as THREE from 'three'
import { loadBinGeometry, createSkin, createSkinAnimation } from './binLoader'

/**
 * 절차적 로우폴리 캐릭터 메시 (ref-assets 로드 실패 시 폴백)
 * 단위: 미터, Y-up. Mercator 변환은 context의 투영행렬이 처리한다.
 */
export function createCharacterMesh(color = 0x4f8ef7): THREE.Group {
  const group = new THREE.Group()

  const mat = new THREE.MeshToonMaterial({ color })

  // 몸통
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 4, 8), mat)
  body.position.y = 0.7
  group.add(body)

  // 머리
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mat)
  head.position.y = 1.45
  group.add(head)

  group.add(createMarker())

  return group
}

// 발밑 위치 표시 링 — 지도 줌(14~20)에서 건물 한 채가 20~30m대라, 몸체
// 크기로는 화면에서 거의 안 보임. 조명 영향을 안 받는 밝은 unlit 재질로
// 큼직하게 표시해 어디 있는지 바로 알아볼 수 있게 함
function createMarker(): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(3, 4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe14f, side: THREE.DoubleSide }),
  )
  marker.rotation.x = -Math.PI / 2
  marker.position.y = 0.05
  return marker
}

/** idle ↔ run 전환에 쓰는 크로스페이드 길이(초) */
const FADE = 0.2

export interface Character {
  /** addAt/moveTo에 넘길 대상 */
  group: THREE.Group
  /** 이동 여부에 따라 idle ↔ run 전환 */
  setMoving(moving: boolean): void
  /** 매 프레임 호출 (dt: 초) */
  update(dt: number): void
  dispose(): void
}

/**
 * ref-assets의 kid 캐릭터를 스킨드 메시로 조립한다.
 * 지오메트리는 loadBinGeometry가 캐시해 모든 캐릭터가 공유하고, 스켈레톤과
 * 재질만 인스턴스마다 새로 만든다.
 */
export async function loadCharacter(color = 0x4f8ef7): Promise<Character> {
  const [mesh, bones, idleClip, runClip] = await Promise.all([
    loadBinGeometry('kid'),
    loadBinGeometry('kid-bones'),
    loadBinGeometry('kid-idle'),
    loadBinGeometry('kid-run'),
  ])

  const material = new THREE.MeshToonMaterial({ color })
  const skinned = createSkin(mesh, bones, material)
  // 스켈레톤이 매 프레임 메시를 변형시키는데 바운딩 볼륨은 바인드 포즈 기준이라
  // 팔다리를 뻗은 프레임에서 잘못 컬링될 수 있음. 캐릭터는 항상 화면 중심
  // 근처에 있으므로 컬링해서 얻을 이득도 없음
  skinned.frustumCulled = false

  const mixer = new THREE.AnimationMixer(skinned)
  const idle = mixer.clipAction(createSkinAnimation('idle', idleClip))
  const run = mixer.clipAction(createSkinAnimation('run', runClip))

  let current = idle
  idle.play()

  const group = new THREE.Group()
  group.add(skinned)
  group.add(createMarker())

  return {
    group,

    setMoving(moving: boolean) {
      const next = moving ? run : idle
      if (next === current) return
      next.enabled = true
      next.setEffectiveTimeScale(1)
      next.setEffectiveWeight(1)
      next.time = 0
      next.play()
      current.crossFadeTo(next, FADE, true)
      current = next
    },

    update(dt: number) {
      mixer.update(dt)
    },

    dispose() {
      mixer.stopAllAction()
      mixer.uncacheRoot(skinned)
      // 지오메트리는 loadBinGeometry 캐시가 소유해 다른 캐릭터와 공유하므로
      // 여기서 dispose하지 않는다. 재질만 인스턴스 소유
      material.dispose()
    },
  }
}
