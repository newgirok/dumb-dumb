import * as THREE from 'three'
import { createSkin } from './bin-loader'
import type { RelayPeerUpdate, RelayPlayerState } from '@/shared/relay/contract'
import { blendKidAnimation, createKidAnimation, type KidAnimation, type KidClips } from './kid-animation'

/** 원본 characters 보간 — 60fps 한 프레임 기준 비율 */
const POSITION_LERP = 0.4
const ROTATION_LERP = 0.4
/** 원격 캐릭터 속도 감쇠(원본 remoteDamp) — 이 속도로 idle↔run을 섞는다 */
const REMOTE_DAMP = 0.625
/** 이보다 멀리 뛰면 보간하지 않고 그 자리로 옮긴다(원본 positionDeltaLimitSnap) */
const SNAP_DISTANCE = 10
/**
 * 탈것(모션 3) — 위치가 몇 초에 한 번씩만 오므로 지난 위치가 온 뒤 흐른 시간(1~8초)에 걸쳐 새 위치까지 미끄러진다.
 * 이보다 멀면(지하철에서 올라왔을 때) 곧장 옮긴다
 */
const GLIDE_MIN_MS = 1000
const GLIDE_MAX_MS = 8000
const GLIDE_DISTANCE = 500
/** 이보다 멀거나 화면 밖이면 포즈를 갱신하지 않는다 */
const ANIMATION_RANGE = 100
/** 들어오면 0.35초에 걸쳐 커지고, 나가면 0.25초에 걸쳐 작아진다(power2.out) */
const APPEAR_S = 0.35
const LEAVE_S = 0.25

interface View {
  mesh: THREE.SkinnedMesh
  material: THREE.Material
  mixer: THREE.AnimationMixer
  animation: KidAnimation
  targetPosition: THREE.Vector3
  targetRotation: THREE.Quaternion
  velocity: THREE.Vector3
  /** 원본 animationOffset — 전역 시간에 더해 캐릭터마다 다른 박자로 움직인다 */
  offset: number
  bornAt: number
  /** 탈것으로 미끄러지는 중 — 출발 자리·시각과 걸리는 시간 */
  glide: { from: THREE.Vector3; at: number; ms: number } | null
}

interface Remote {
  data: Partial<RelayPlayerState>
  view: View | null
  leftAt: number
  leaveFrom: number
  /** 위치가 마지막으로 온 시각 */
  movedAt: number
}

export interface Remotes {
  /** 서버가 보낸 필드를 합친다. 네 필드가 다 모이면 캐릭터를 세운다 */
  apply(update: RelayPeerUpdate): void
  remove(id: string): void
  /** 방에 (다시) 들어갔거나 끊겼다 — 원본 _removeAllCharacters처럼 곧바로 지운다 */
  clear(): void
  update(ratio: number, camera: THREE.Camera, local: THREE.Vector3): void
  /** 지금 화면에 선 캐릭터의 발 위치(사라지는 중인 캐릭터는 뺀다) — 만남 대화가 거리와 머리 위 자리를 잰다 */
  positions(): ReadonlyMap<string, THREE.Vector3>
  dispose(): void
}

const UP = new THREE.Vector3(0, 1, 0)
const ORIGIN = new THREE.Vector3()
const _spherical = new THREE.Spherical()
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _look = new THREE.Matrix4()

/** 원본 quaternionFromSpherical — 등 뒤 방위(spherical)를 몸 방향으로 바꾼다 */
function quaternionFromSpherical([phi, theta]: [number, number], target: THREE.Quaternion) {
  _forward.setFromSpherical(_spherical.set(1, phi, theta))
  _right.crossVectors(_forward, UP)
  _up.crossVectors(_right, _forward)
  _look.lookAt(ORIGIN, _forward, _up)
  target.setFromRotationMatrix(_look)
}

/** gsap power2.out(=cubic) */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * 같은 방 다른 캐릭터들 — 원본 characters의 원격 인스턴스를 스킨드 메시 한 벌씩으로 그린다.
 * 받은 위치를 목표점이, 목표점을 몸이 한 번 더 따라가 35ms 간격 갱신을 매끄럽게 잇고,
 * 움직인 거리로 속도를 다시 만들어 로컬 캐릭터와 같은 규칙으로 idle·run·air·bored를 섞는다.
 */
export function createRemotes({
  scene,
  geometry,
  bones,
  clips,
  createMaterial,
}: {
  scene: THREE.Scene
  geometry: THREE.BufferGeometry
  bones: THREE.BufferGeometry
  clips: KidClips
  createMaterial: (seed: number) => THREE.Material
}): Remotes {
  const remotes = new Map<string, Remote>()
  const standing = new Map<string, THREE.Vector3>()
  const frustum = new THREE.Frustum()
  const viewProjection = new THREE.Matrix4()
  const sphere = new THREE.Sphere()
  const prev = new THREE.Vector3()
  const next = new THREE.Vector3()
  const step = new THREE.Vector3()
  const rotation = new THREE.Quaternion()

  function createView(data: RelayPlayerState): View {
    const material = createMaterial(data.s)
    const mesh = createSkin(geometry, bones, material)
    mesh.name = 'remote-kid'
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.position.fromArray(data.p)
    quaternionFromSpherical(data.r, mesh.quaternion)
    const mixer = new THREE.AnimationMixer(mesh)
    const animation = createKidAnimation(mixer, clips)
    const offset = Math.random() * 100
    mixer.setTime(performance.now() / 1000 + offset)
    // 첫 포즈로 바운딩 스피어를 잡아 두면 화면 밖에서는 그리지 않는다(크기 0에서는 못 잰다)
    mesh.updateMatrixWorld(true)
    mesh.computeBoundingSphere()
    mesh.scale.setScalar(0)
    scene.add(mesh)
    return {
      mesh,
      material,
      mixer,
      animation,
      targetPosition: mesh.position.clone(),
      targetRotation: mesh.quaternion.clone(),
      velocity: new THREE.Vector3(),
      offset,
      bornAt: performance.now(),
      glide: null,
    }
  }

  function destroy(id: string) {
    const view = remotes.get(id)?.view
    remotes.delete(id)
    if (!view) return
    scene.remove(view.mesh)
    view.mixer.stopAllAction()
    view.mesh.skeleton.dispose()
    view.material.dispose()
  }

  function clear() {
    for (const id of [...remotes.keys()]) destroy(id)
  }

  return {
    clear,
    dispose: clear,

    positions() {
      standing.clear()
      for (const [id, remote] of remotes) {
        if (remote.view && remote.leftAt < 0) standing.set(id, remote.view.mesh.position)
      }
      return standing
    },

    apply({ id, ...fields }) {
      let remote = remotes.get(id)
      if (!remote) {
        remote = { data: {}, view: null, leftAt: -1, leaveFrom: 1, movedAt: performance.now() }
        remotes.set(id, remote)
      }
      if (remote.leftAt >= 0) {
        // 사라지던 캐릭터가 다시 보인다(내 주변에서 멀어졌다 돌아왔다) — 지금 크기에서 다시 커진다
        remote.leftAt = -1
        if (remote.view) {
          const u = 1 - Math.cbrt(1 - remote.view.mesh.scale.x)
          remote.view.bornAt = performance.now() - APPEAR_S * 1000 * u
        }
      }
      Object.assign(remote.data, fields)
      const { p, r, a, s } = remote.data
      if (!remote.view && p && r && a !== undefined && s !== undefined) {
        remote.view = createView({ p, r, a, s })
      }
      if (fields.p) {
        const now = performance.now()
        if (remote.view && a === 3) {
          const ms = THREE.MathUtils.clamp(now - remote.movedAt, GLIDE_MIN_MS, GLIDE_MAX_MS)
          remote.view.glide = { from: remote.view.mesh.position.clone(), at: now, ms }
        }
        remote.movedAt = now
      }
    },

    remove(id) {
      const remote = remotes.get(id)
      if (!remote) return
      if (!remote.view) {
        remotes.delete(id)
        return
      }
      if (remote.leftAt < 0) {
        remote.leftAt = performance.now()
        remote.leaveFrom = remote.view.mesh.scale.x
      }
    },

    update(ratio, camera, local) {
      const now = performance.now()
      const kp = 1 - Math.pow(1 - POSITION_LERP, ratio)
      const kr = 1 - Math.pow(1 - ROTATION_LERP, ratio)
      const friction = Math.pow(REMOTE_DAMP, ratio)
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(viewProjection)

      for (const [id, remote] of remotes) {
        const view = remote.view
        if (!view) continue
        const { mesh } = view
        const data = remote.data as RelayPlayerState

        if (remote.leftAt >= 0) {
          const t = Math.min(1, (now - remote.leftAt) / 1000 / LEAVE_S)
          if (t >= 1) {
            destroy(id)
            continue
          }
          mesh.scale.setScalar(remote.leaveFrom * (1 - easeOut(t)))
        } else {
          mesh.scale.setScalar(easeOut(Math.min(1, (now - view.bornAt) / 1000 / APPEAR_S)))
        }

        // 위치 — 목표점이 받은 위치를, 몸이 목표점을 따라간다. 10m 넘게 뛰면 곧장 옮긴다.
        // 탈것이면 받은 위치까지 정해진 시간에 걸쳐 선 채로 미끄러진다
        prev.copy(mesh.position)
        next.fromArray(data.p)
        const glide = data.a === 3 && view.glide && view.glide.from.distanceTo(next) <= GLIDE_DISTANCE ? view.glide : null
        if (glide) {
          mesh.position.lerpVectors(glide.from, next, Math.min(1, (now - glide.at) / glide.ms))
          view.targetPosition.copy(mesh.position)
          view.velocity.set(0, 0, 0)
        } else {
          const snap = next.distanceTo(prev) > SNAP_DISTANCE
          const k = snap ? 1 : kp
          view.targetPosition.lerp(next, k)
          mesh.position.lerp(view.targetPosition, k)
          view.velocity.add(step.subVectors(mesh.position, prev).multiplyScalar(ratio))
          view.velocity.multiplyScalar(snap ? 0 : friction)
        }

        quaternionFromSpherical(data.r, rotation)
        view.targetRotation.slerp(rotation, kr)
        mesh.quaternion.slerp(view.targetRotation, kr)

        // 옷 색 — 상대가 색을 바꾸면 시드가 새로 온다
        const shader = view.material.userData.shader as
          | { uniforms: { uSeed: { value: number } } }
          | undefined
        if (shader) shader.uniforms.uSeed.value = data.s

        blendKidAnimation(view.animation, Math.hypot(view.velocity.x, view.velocity.z), data.a, ratio)
        const bounds = mesh.boundingSphere!
        sphere.center.copy(bounds.center).add(mesh.position)
        sphere.radius = bounds.radius
        if (mesh.position.distanceTo(local) <= ANIMATION_RANGE && frustum.intersectsSphere(sphere)) {
          view.mixer.setTime(now / 1000 + view.offset)
        }
      }
    },
  }
}
