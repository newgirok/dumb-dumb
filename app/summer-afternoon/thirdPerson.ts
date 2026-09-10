import * as THREE from 'three'

/**
 * 원본과 같은 3인칭 조작.
 *
 * 원본 controls/followCamera를 뜯어보면 카메라는 유저가 직접 못 돌린다
 * (enableRotate=false). 드래그는 카메라 회전이 아니라 "가상 조이스틱"이라
 * 이동 입력에 그대로 더해지고(_v0.x += touchDelta.x), 카메라는 캐릭터
 * 뒤쪽으로 느리게(원본 lerp 0.03) 알아서 돌아온다. 카메라와 캐릭터 사이에
 * 벽이 끼면 반경을 줄여 파고들지 않게 한다.
 *
 * 지면 높이·벽·카메라 충돌은 collider.bin 레이캐스트로 구한다.
 * (원본은 MeshBVH를 쓰지만 레이 3~4개/프레임이면 표준 Raycaster로 충분하다.)
 */

const WALK_SPEED = 3.2
/** 캐릭터가 진행 방향으로 도는 속도 */
const TURN_LERP = 10
/** 카메라가 캐릭터 뒤로 돌아오는 속도 — 원본 cameraRotationLerp 0.03 상당 */
const CAMERA_YAW_LERP = 1.8
/** 멈춰 있을 때의 회전 배수 — 원본 cameraInactiveMultiplier */
const CAMERA_IDLE_MUL = 0.025
/** 카메라가 목표 위치를 따라잡는 속도 */
const CAMERA_LERP = 5
const CAMERA_BACK = 6
const CAMERA_HEIGHT = 1.7
const CAMERA_LOOK_HEIGHT = 1.1
/** 카메라가 벽을 파고들지 않도록 확보하는 여유 */
const CAMERA_CLEARANCE = 0.4
/** 이 거리 안에 벽이 있으면 그 방향으로 못 간다 */
const WALL_CLEARANCE = 0.6
const JUMP_SPEED = 5.2
const GRAVITY = -14
/** 드래그를 최대 입력으로 치는 픽셀 거리 (원본 controlMouseAmount) */
const DRAG_RANGE = 200

export interface ThirdPerson {
  update(dt: number): void
  dispose(): void
  /** 수평 이동 속도 (잔디 반응용) */
  speed: number
  moving: boolean
  /** 공중에 떠 있는가 (kid-air 재생용) */
  airborne: boolean
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
  const drag = new THREE.Vector2()
  let dragging = false
  let originX = 0
  let originY = 0
  let verticalSpeed = 0
  let jumpQueued = false
  let camYaw = character.rotation.y + Math.PI

  const position = start.clone()
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const probe = new THREE.Vector3()
  const move = new THREE.Vector3()
  const desiredCam = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const lookAt = new THREE.Vector3()

  collider.updateMatrixWorld(true)

  const onKey = (e: KeyboardEvent) => {
    const pressed = e.type === 'keydown'
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.forward = pressed; break
      case 'KeyS': case 'ArrowDown': keys.back = pressed; break
      case 'KeyA': case 'ArrowLeft': keys.left = pressed; break
      case 'KeyD': case 'ArrowRight': keys.right = pressed; break
      case 'Space': if (pressed) jumpQueued = true; break
      default: return
    }
    e.preventDefault()
  }

  // 드래그는 카메라가 아니라 이동 입력이다 (원본 가상 조이스틱)
  const onDown = (e: PointerEvent) => {
    dragging = true
    originX = e.clientX
    originY = e.clientY
    drag.set(0, 0)
    domElement.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    drag.set((e.clientX - originX) / DRAG_RANGE, (e.clientY - originY) / DRAG_RANGE)
    drag.clampLength(0, 1)
  }
  const onUp = (e: PointerEvent) => {
    dragging = false
    drag.set(0, 0)
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

  /** 캐릭터 → 카메라 사이에 벽이 끼면 반경을 줄인다 */
  function cameraRadius(from: THREE.Vector3, dir: THREE.Vector3, wanted: number): number {
    probe.copy(from).setY(from.y + CAMERA_LOOK_HEIGHT)
    raycaster.set(probe, dir)
    raycaster.far = wanted
    const hit = raycaster.intersectObject(collider, false)[0]
    return hit ? Math.max(1, hit.distance - CAMERA_CLEARANCE) : wanted
  }

  /** -PI..PI로 감싼 최단 각도차 */
  function shortestAngle(delta: number): number {
    return THREE.MathUtils.euclideanModulo(delta + Math.PI, Math.PI * 2) - Math.PI
  }

  const state: ThirdPerson = {
    speed: 0,
    moving: false,
    airborne: false,

    update(dt: number) {
      // 키 입력과 드래그 조이스틱을 하나의 (전진, 우측) 벡터로 합친다
      const forwardRaw = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0) - drag.y
      const strafeRaw = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + drag.x
      const magnitude = Math.min(1, Math.hypot(forwardRaw, strafeRaw))

      state.moving = magnitude > 0.05
      if (state.moving) {
        const forward = forwardRaw / magnitude
        const strafe = strafeRaw / magnitude
        // 카메라는 캐릭터의 camYaw 쪽에 있으므로 전진은 카메라에서 멀어지는 방향
        move.set(
          -Math.sin(camYaw) * forward + Math.cos(camYaw) * strafe,
          0,
          -Math.cos(camYaw) * forward - Math.sin(camYaw) * strafe,
        )
        move.normalize()
        if (!blocked(position, move)) {
          position.addScaledVector(move, WALK_SPEED * magnitude * dt)
        }
        // 캐릭터는 진행 방향을 부드럽게 바라본다
        const targetAngle = Math.atan2(move.x, move.z)
        character.rotation.y +=
          shortestAngle(targetAngle - character.rotation.y) * Math.min(1, TURN_LERP * dt)
      }

      // 지면 높이 + 점프/중력
      const ground = groundHeight(position.x, position.z, position.y)
      if (jumpQueued && !state.airborne) {
        verticalSpeed = JUMP_SPEED
        state.airborne = true
      }
      jumpQueued = false

      if (state.airborne) {
        verticalSpeed += GRAVITY * dt
        position.y += verticalSpeed * dt
        if (position.y <= ground) {
          position.y = ground
          verticalSpeed = 0
          state.airborne = false
        }
      } else {
        position.y = ground
      }

      character.position.copy(position)
      state.speed = state.moving ? WALK_SPEED * magnitude : 0

      // 카메라는 유저가 못 돌린다 — 캐릭터 뒤로 느리게 알아서 돌아온다.
      //
      // 중요한 건 회전 배수다. 원본은 fit(dot(현재 카메라 방위, 목표 방위),
      // -1, 0, 0, 1)을 곱한다. 캐릭터가 카메라 쪽으로 곧장 걸어오면 두 방위가
      // 정반대(dot=-1)라 배수가 0이 되어 카메라가 아예 안 돈다. 이게 없으면
      // 뒤로 걸을 때 "캐릭터가 카메라를 보고 돌면 카메라가 그 뒤로 돌고
      // 이동 방향이 또 바뀌는" 피드백 루프가 생겨 화면이 계속 회전한다.
      const desiredYaw = character.rotation.y + Math.PI
      const alignment = Math.cos(desiredYaw - camYaw)
      const rotateMul = state.moving
        ? THREE.MathUtils.clamp(alignment, -1, 0) + 1
        : CAMERA_IDLE_MUL
      camYaw +=
        shortestAngle(desiredYaw - camYaw) * Math.min(1, CAMERA_YAW_LERP * rotateMul * dt)

      toCam.set(Math.sin(camYaw), 0, Math.cos(camYaw))
      const radius = cameraRadius(position, toCam, CAMERA_BACK)
      desiredCam.set(
        position.x + toCam.x * radius,
        position.y + CAMERA_HEIGHT,
        position.z + toCam.z * radius,
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
