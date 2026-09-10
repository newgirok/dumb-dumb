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
/** 카메라가 캐릭터 뒤로 자동으로 돌아오는 속도 */
const CAMERA_YAW_LERP = 2.6
/** 멈춰 있을 때의 회전 배수(거의 안 돎) */
const CAMERA_IDLE_MUL = 0.05
/** 카메라가 목표 위치를 따라잡는 속도 */
const CAMERA_LERP = 5
const CAMERA_BACK = 6
const CAMERA_HEIGHT = 1.7
const CAMERA_LOOK_HEIGHT = 1.1
/** 카메라가 벽을 파고들지 않도록 확보하는 여유 */
const CAMERA_CLEARANCE = 0.4
/** 이 거리 안에 벽이 있으면 그 방향으로 못 간다 */
const WALL_CLEARANCE = 0.6
/** 한 걸음에 오를 수 있는 최대 단차 — 이보다 급하면 건물·벽으로 보고 막는다 */
const MAX_STEP = 0.6
const JUMP_SPEED = 5.2
const GRAVITY = -14
/** 이 픽셀 안에서는 방향을 안 정한다(떨림 방지) */
const POINTER_DEADZONE = 12

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
  // drag = 화면 중앙(≈캐릭터) 기준 커서 방향 단위벡터. 키보드처럼 항상
  // 최고 속도로, 커서가 있는 쪽으로 이동한다.
  const drag = new THREE.Vector2()
  let dragging = false
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

  // 화면 중앙(캐릭터가 대략 여기 있다)에서 커서까지의 방향을 단위벡터로.
  // 데드존을 넘으면 방향만 취하고 크기는 1로 고정 → 키보드와 같은 속도.
  const aimAtPointer = (clientX: number, clientY: number) => {
    const rect = domElement.getBoundingClientRect()
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    if (Math.hypot(dx, dy) < POINTER_DEADZONE) drag.set(0, 0)
    else drag.set(dx, dy).normalize()
  }

  // 왼쪽 버튼 = 커서 방향 이동, 오른쪽 버튼 = 점프.
  // 오른쪽 버튼은 브라우저 컨텍스트 메뉴를 띄우므로 onContextMenu로 막는다.
  const onDown = (e: PointerEvent) => {
    if (e.button === 2) {
      // 오른쪽 클릭 = 점프
      jumpQueued = true
      e.preventDefault()
      return
    }
    if (e.button !== 0) return
    dragging = true
    aimAtPointer(e.clientX, e.clientY)
    try {
      domElement.setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 등 활성 포인터가 없으면 캡처 생략 */
    }
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    aimAtPointer(e.clientX, e.clientY)
  }
  const onUp = (e: PointerEvent) => {
    if (e.button !== 0) return
    dragging = false
    drag.set(0, 0)
    try {
      domElement.releasePointerCapture(e.pointerId)
    } catch {
      /* 활성 포인터가 없으면 무시 */
    }
  }
  const onContextMenu = (e: Event) => e.preventDefault()

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  domElement.addEventListener('pointerdown', onDown)
  domElement.addEventListener('pointermove', onMove)
  domElement.addEventListener('pointerup', onUp)
  domElement.addEventListener('pointercancel', onUp)
  domElement.addEventListener('contextmenu', onContextMenu)

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
        // 건물·벽 앞에서 막고(수평 레이), 계단보다 급하게 높아지는 지면도 막아
        // 건물을 타고 올라가지 않게 한다. 완만한 경사는 그대로 오른다.
        const stepDist = WALK_SPEED * magnitude * dt
        const nextX = position.x + move.x * stepDist
        const nextZ = position.z + move.z * stepDist
        const nextGround = groundHeight(nextX, nextZ, position.y)
        const climbable = state.airborne || nextGround - position.y <= MAX_STEP
        if (!blocked(position, move) && climbable) {
          position.x = nextX
          position.z = nextZ
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

      // 카메라는 이동 방향을 따라 캐릭터 뒤로 자동 회전한다(원본 방식).
      // 배수가 핵심이다: 캐릭터가 카메라 쪽으로 곧장 걸어오면(정반대, dot=-1)
      // 배수가 0이 되어 카메라가 안 돈다. 이게 없으면 "카메라가 돌면 이동
      // 방향이 또 바뀌는" 피드백 루프로 화면이 계속 회전한다. 정면(뒤)으로
      // 걸을 땐 desiredYaw≈camYaw라 회전량이 0 → 직진은 정확히 직진이 된다.
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
      domElement.removeEventListener('contextmenu', onContextMenu)
    },
  }

  return state
}
