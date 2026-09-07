import * as THREE from 'three'

/**
 * 절차적 로우폴리 캐릭터 메시 (GLB 로드 전 플레이스홀더)
 * 단위: 미터. Mercator scale은 context.addAt()이 처리.
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

  // 발밑 위치 표시 링 — 지도 줌(14~20)에서 건물 한 채가 20~30m대라, 몸체
  // 크기로는 화면에서 거의 안 보임. 조명 영향을 안 받는 밝은 unlit 재질로
  // 큼직하게 표시해 어디 있는지 바로 알아볼 수 있게 함
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(3, 4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe14f, side: THREE.DoubleSide }),
  )
  marker.rotation.x = -Math.PI / 2
  marker.position.y = 0.05
  group.add(marker)

  // Three.js Y-up → Mapbox Mercator Z-up 변환
  group.rotation.x = Math.PI / 2

  return group
}
