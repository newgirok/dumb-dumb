import * as THREE from 'three'

/**
 * 원본과 같은 3인칭 조작 — WASD 이동 + 드래그로 카메라 회전.
 * 지면 높이와 벽 막힘은 collider.bin에 레이캐스트해서 구한다.
 * (원본은 MeshBVH를 쓰지만 레이 3개/프레임이면 표준 Raycaster로 충분하다.)
 */

const WALK_SPEED = 3.2
const TURN_LERP = 12
const CAMERA_BACK = 6
const CAMERA_HEIGHT = 2.2
const CAMERA_LOOK_HEIGHT = 1.1
/** 카메라가 목표 위치를 따라잡는 속도 — 클수록 뻣뻣하다 */
const CAMERA_LERP = 6
/** 이 거리 안에 벽이 있으면 그 방향으로 못 간다 */
const WALL_CLEARANCE = 0.6
const PITCH_MIN = -0.35
const PITCH_MAX = 0.8

export interface ThirdPerson {
  update(dt: number): void
  dispose(): void
  /** 수평 이동 속도 (잔디 반응용) */
  speed: number
  moving: boolean
}

export function createThirdPerson({
  camera,
  character,
  collider,
  domElement,
  start,
}: {
  camera: THREE.PerspectiveCamera
  character: THREE.Object3D
  collider: THREE.Mesh
  domElement: HTMLElement
  start: THREE.Vector3
}): ThirdPerson {
  const keys = { forward: false, back: false, left: false, right: false }
  let yaw = 0
  let pitch = 0.25
  let dragging = false
  let lastX = 0
  let lastY = 0

  const position = start.clone()
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const probe = new THREE.Vector3()
  const move = new THREE.Vector3()
  const desiredCam = new THREE.Vector3()
  const lookAt = new THREE.Vector3()

  collider.updateMatrixWorld(true)

  const onKey = (e: KeyboardEvent) => {
    const pressed = e.type === 'keydown'
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.forward = pressed; break
      case 'KeyS': case 'ArrowDown': keys.back = pressed; break
      case 'KeyA': case 'ArrowLeft': keys.left = pressed; break
      case 'KeyD': case 'ArrowRight': keys.right = pressed; break
      default: return
    }
    e.preventDefault()
  }

  const onDown = (e: PointerEvent) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    domElement.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    yaw -= (e.clientX - lastX) * 0.005
    pitch = THREE.MathUtils.clamp(pitch + (e.clientY - lastY) * 0.003, PITCH_MIN, PITCH_MAX)
    lastX = e.clientX
    lastY = e.clientY
  }
  const onUp = (e: PointerEvent) => {
    dragging = false
    domElement.releasePointerCapture?.(e.pointerId)
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  domElement.addEventListener('pointerdown', onDown)
  domElement.addEventListener('pointermove', onMove)
  domElement.addEventListener('pointerup', onUp)
  domElement.addEventListener('pointercancel', onUp)

  /** 위에서 아래로 쏴서 지면 높이를 구한다. 못 맞히면 이전 높이 유지 */
  function groundHeight(x: number, z: number, fallback: number): number {
    probe.set(x, fallback + 5, z)
    raycaster.set(probe, down)
    raycaster.far = 30
    const hit = raycaster.intersectObject(collider, false)[0]
    return hit ? hit.point.y : fallback
  }

  /** 진행 방향에 벽이 있으면 막는다 */
  function blocked(from: THREE.Vector3, dir: THREE.Vector3): boolean {
    probe.copy(from).setY(from.y + 0.8)
    raycaster.set(probe, dir)
    raycaster.far = WALL_CLEARANCE
    return raycaster.intersectObject(collider, false).length > 0
  }

  const state: ThirdPerson = {
    speed: 0,
    moving: false,

    update(dt: number) {
      const forward = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
      const strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)

      state.moving = forward !== 0 || strafe !== 0
      if (state.moving) {
        // 카메라 기준 이동 — yaw만 반영해 수평면에서 움직인다
        move.set(
          Math.sin(yaw) * forward + Math.cos(yaw) * strafe,
          0,
          Math.cos(yaw) * forward - Math.sin(yaw) * strafe,
        )
        move.normalize()
        if (!blocked(position, move)) {
          position.addScaledVector(move, WALK_SPEED * dt)
        }
        // 캐릭터는 진행 방향을 부드럽게 바라본다
        const targetAngle = Math.atan2(move.x, move.z)
        const delta = THREE.MathUtils.euclideanModulo(
          targetAngle - character.rotation.y + Math.PI, Math.PI * 2,
        ) - Math.PI
        character.rotation.y += delta * Math.min(1, TURN_LERP * dt)
      }

      position.y = groundHeight(position.x, position.z, position.y)
      character.position.copy(position)
      state.speed = state.moving ? WALK_SPEED : 0

      // 카메라: 뒤쪽 위에서 스프링으로 따라온다
      const horizontal = Math.cos(pitch) * CAMERA_BACK
      desiredCam.set(
        position.x + Math.sin(yaw) * horizontal,
        position.y + CAMERA_HEIGHT + Math.sin(pitch) * CAMERA_BACK,
        position.z + Math.cos(yaw) * horizontal,
      )
      camera.position.lerp(desiredCam, Math.min(1, CAMERA_LERP * dt))
      lookAt.set(position.x, position.y + CAMERA_LOOK_HEIGHT, position.z)
      camera.lookAt(lookAt)
    },

    dispose() {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      domElement.removeEventListener('pointerdown', onDown)
      domElement.removeEventListener('pointermove', onMove)
      domElement.removeEventListener('pointerup', onUp)
      domElement.removeEventListener('pointercancel', onUp)
    },
  }

  return state
}
