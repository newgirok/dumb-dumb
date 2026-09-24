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

// 이동 속도(m/s). 원하는 페이스로 이 값만 조정하면 된다.
const WALK_SPEED = 3.0
/** 캐릭터가 진행 방향으로 도는 속도 */
const TURN_LERP = 10
/**
 * 카메라가 캐릭터 뒤로 자동으로 돌아오는 속도.
 * 원본은 프레임당 lerp ≈ 0.03으로 느리게 돌아온다. 60fps 기준
 * `CAMERA_YAW_LERP * dt ≈ 0.03`이 되도록 1.8로 맞춘다.
 */
const CAMERA_YAW_LERP = 1.8
/** 멈춰 있을 때의 회전 배수(거의 안 돎) */
const CAMERA_IDLE_MUL = 0.05
/**
 * 카메라가 캐릭터 뒤로 돌아오는 최대 각속도(rad/s). 좌우로 이동할 때 카메라가
 * 너무 빨리 따라 돌면 회전 반경이 작아져 '제자리 스핀'처럼 보인다. 상한을 두면
 * 캐릭터가 넓은 원호를 그리며 돈다. 대략 원 반경 ≈ WALK_SPEED / MAX_CAM_YAW_RATE.
 */
const MAX_CAM_YAW_RATE = 0.8
/** 카메라가 목표 위치를 따라잡는 속도 */
const CAMERA_LERP = 5
// 3인칭 추적 카메라 프레이밍(발끝-지면 기준). 카메라 눈높이보다 시선을 낮춰
// 살짝 내려다보게 두면 (a) 근경이 지형으로 덮여 도로 아래 바다 평면(y=-0.8)이
// 전경으로 새어 보이지 않고, (b) 캐릭터가 지면에 붙어 그라운디드한 몰입감이 산다.
// 반대로 카메라를 너무 낮추고 시선을 수평으로 두면 저고도 near-level 시선이
// 지형 립을 넘어 바다를 비춘다(전경 청록 띠 버그). 이 3개 값이 프레이밍 노브다.
//
// 카메라는 발이 아니라 시선 목표점(아래 LOOK_HEIGHT/FORWARD)을 중심으로 한
// 구면좌표에 선다. 원본 WebGL 행렬 실측: 인트로 줌(반경 +12→0) 내내 pitch가
// -9.866°로 불변 → 원본은 시선 목표점을 중심으로 반경만 줄인다. 정착 시
// 캐릭터 뒤 ≈5.3m, 발끝 위 ≈2.1m. 반경 5.9·앙각 9.866°면 뒤 5.3m·높이 2.2m.
const CAMERA_RADIUS = 5.9
const CAMERA_ELEVATION = THREE.MathUtils.degToRad(9.866)
/**
 * 인트로 카메라 돌리 — 멀리서(줌아웃) 시작해 제자리로 당겨온다.
 * 원본 playIntroAnimation: followSphericalZoom 12 → 0, duration 6s, easeInOut3.
 */
const INTRO_ZOOM = 12
const INTRO_DURATION = 6
// 시선 높이(발끝 기준) — 카메라(1.55)보다 낮춰 살짝 내려다본다. 전방 0.5.
const CAMERA_LOOK_HEIGHT = 1.2
const CAMERA_LOOK_FORWARD = 0.5
/**
 * idle 카메라 흔들림("살랑살랑") — 원본 setupCamera: shake(.08,.08,.02),
 * shakeSpeed .2. theta/phi에 사인노이즈를 얹어 쉬는 중에도 화면이 부드럽게
 * 흔들린다. touchAmount(0→1)로 서서히 켜진다(원본 gsap delay:4 duration:4).
 */
// 원본 소스 shake(.08,.08,.02) 그대로. 흔들림이 원본처럼 순수 회전이라 원본값이
// 곧 맞는 값이다(WebGL 행렬 실측, 인트로 후 10~40s 표준편차 pitch 1.09°·yaw 1.19°).
const SHAKE_THETA = 0.08
const SHAKE_PHI = 0.08
const SHAKE_ROLL = 0.02
const SHAKE_SPEED = 0.2
const SHAKE_FADE_DELAY = 4
const SHAKE_FADE_DURATION = 4

/**
 * 패시브 마우스 패럴랙스 — 드래그와 무관하게 "커서를 움직이면 카메라가 은은히
 * 둘러보는" 감각. 커서의 화면상 위치([-1,1])에 비례해 카메라 구면좌표의
 * 요우(theta)/피치(phi)에 소량의 오프셋을 준다. camYaw(자동 추종)에는 더하지
 * 않으므로 이동 방향과 피드백 루프가 생기지 않는다(패럴랙스는 순수 시점 오프셋).
 * 인트로 이후 touchAmount로 서서히 켜져 리빌 스냅을 방해하지 않는다.
 */
const PARALLAX_YAW = 0.16
const PARALLAX_PITCH = 0.06
const PARALLAX_LERP = 3
/**
 * 카메라 상하 시야 제한(원본식). 카메라를 위로 젖히면(구면좌표 phi 증가) 시선이
 * 수평에 가까워지며 지형 립 너머의 바다 평면(y=-0.8)이 전경에 드러난다(청록 띠).
 * 그래서 '위로' 방향은 아주 좁게(CAM_PHI_UP), 내려다보는 '아래' 방향은 안전하므로
 * 넉넉히(CAM_PHI_DOWN) 허용한다. 마우스를 화면 위로 끝까지 올려도 여기서 멈춘다.
 */
const CAM_PHI_UP = 0.02
const CAM_PHI_DOWN = 0.18

/**
 * 원본 noises.sineNoise1 — 6개 사인 합을 6으로 나눈 [-1,1] 매끈한 노이즈.
 * 세 번째 인자에 시간을 넣어 느린 파도 같은 흔들림을 만든다.
 */
function sineNoise1(x: number, y: number, z: number): number {
  let r = 0
  r += Math.sin(x * 1.5 + y * 3.4598 + z * 1.234)
  r += Math.sin(x * 3.12 + y * -3.234 + z * 4.221)
  r += Math.sin(x * 0.355 + y * 2.3 + z * -1.375)
  r += Math.sin(x * -0.156 + y * -3.34 + z * -0.4566)
  r += Math.sin(x * -4.1235 + y * -0.485 + z * -1.45)
  r += Math.sin(x * 2.54 + y * -0.879 + z * -2.123)
  return r / 6
}
/** 카메라가 벽을 파고들지 않도록 확보하는 여유 */
const CAMERA_CLEARANCE = 0.4
/** 이 거리 안에 벽이 있으면 그 방향으로 못 간다 */
const WALL_CLEARANCE = 0.6
/** 한 걸음에 오를 수 있는 최대 단차 — 이보다 급하면 건물·벽으로 보고 막는다 */
const MAX_STEP = 0.6
const JUMP_SPEED = 5.2
const GRAVITY = -14
/**
 * 원본 가상 조이스틱 — 클릭 지점이 아니라 화면의 "고정점" 기준이다.
 * 원본 mouseCenter (0, -0.45): 가로 중앙, 세로는 위에서 72.5% 지점(≈캐릭터
 * 발밑). 커서가 이 점에서 얼마나 떨어졌는지로 이동 방향·속도가 정해지고,
 * controlMouseAmount(200px)에서 최고 속도가 된다. 그래서 "클릭하면 그 방향으로
 * 곧장 이동"하고, 누른 채 커서를 옮기면 방향이 바뀐다(원본과 동일).
 */
const CONTROL_MOUSE_AMOUNT = 200
const MOUSE_CENTER_Y_FRAC = 0.725

export interface ThirdPerson {
  update(dt: number): void
  dispose(): void
  /** 인트로 카메라 돌리를 시작한다(멀리서 제자리로) */
  startIntro(): void
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
  // drag = 화면 고정점 기준 커서 방향·세기(길이 0~1). 원본 touchDelta처럼
  // (x: 좌우, y: 앞뒤) 이동 입력에 그대로 더해진다.
  const drag = new THREE.Vector2()
  // 커서의 화면상 정규화 위치([-1,1]) — 드래그 여부와 무관하게 항상 추적한다.
  const pointer = new THREE.Vector2(0, 0)
  // 현재 적용 중인 패럴랙스 오프셋(요우/피치) — 목표값으로 부드럽게 수렴한다.
  let parYaw = 0
  let parPitch = 0
  let dragging = false
  let verticalSpeed = 0
  let jumpQueued = false
  let camYaw = character.rotation.y + Math.PI
  // 인트로 돌리는 벽시계(performance.now)로 구동한다 — 에셋 로딩 직후 첫 프레임의
  // 큰 dt가 누적돼 인트로가 통째로 스킵되던 문제를 막는다(원본도 gsap 벽시계 트윈).
  let introActive = false
  let introStartMs = -1
  // idle 흔들림 위상용 기준 시각
  let clockBaseMs = -1

  const position = start.clone()
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const probe = new THREE.Vector3()
  const move = new THREE.Vector3()
  const desiredCam = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const lookAt = new THREE.Vector3()
  const camOffset = new THREE.Vector3()
  const viewDir = new THREE.Vector3()
  const camSpherical = new THREE.Spherical()

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

  // 화면 고정점(가로 중앙, 세로 72.5%)에서 커서까지의 거리를 이동 입력으로
  // 환산한다(원본 mouseCenter 방식). 200px에서 최고 속도, 길이는 1로 클램프.
  // (x: +우 / y: +아래) → update()에서 strafe(+drag.x), forward(-drag.y)로 쓴다.
  const updateDrag = (clientX: number, clientY: number) => {
    const rect = domElement.getBoundingClientRect()
    const cx = rect.left + rect.width * 0.5
    const cy = rect.top + rect.height * MOUSE_CENTER_Y_FRAC
    let dx = (clientX - cx) / CONTROL_MOUSE_AMOUNT
    let dy = (clientY - cy) / CONTROL_MOUSE_AMOUNT
    const len = Math.hypot(dx, dy)
    if (len > 1) {
      dx /= len
      dy /= len
    }
    drag.set(dx, dy)
  }

  // 커서의 화면상 정규화 위치([-1,1]) — 패럴랙스 전용(드래그와 무관하게 갱신).
  const updatePointer = (clientX: number, clientY: number) => {
    const rect = domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      ((clientY - rect.top) / rect.height) * 2 - 1,
    )
  }

  // 왼쪽 버튼 = 커서 방향 이동(누르는 즉시), 오른쪽 버튼 = 점프.
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
    // 클릭 즉시 그 방향으로 이동(원본과 동일 — 눌린 순간 touchDelta 계산)
    updateDrag(e.clientX, e.clientY)
    try {
      domElement.setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 등 활성 포인터가 없으면 캡처 생략 */
    }
  }
  const onMove = (e: PointerEvent) => {
    // 패럴랙스는 드래그 여부와 무관하게 커서를 따라간다
    updatePointer(e.clientX, e.clientY)
    if (!dragging) return
    updateDrag(e.clientX, e.clientY)
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

  /** 시선 목표점 → 카메라 사이에 벽이 끼면 반경을 줄인다 */
  function cameraRadius(from: THREE.Vector3, dir: THREE.Vector3, wanted: number): number {
    raycaster.set(from, dir)
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

    startIntro() {
      introActive = true
      introStartMs = performance.now()
    },

    update(dt: number) {
      const nowMs = performance.now()
      if (clockBaseMs < 0) clockBaseMs = nowMs
      const clock = (nowMs - clockBaseMs) / 1000
      const introSec = introStartMs >= 0 ? (nowMs - introStartMs) / 1000 : -1
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
      // 상한을 둬 좌우 이동 시 카메라가 넓은 원호로 천천히 따라 돌게 한다
      // (상한이 없으면 반경이 작아져 제자리 스핀처럼 보인다)
      const yawStep =
        shortestAngle(desiredYaw - camYaw) * Math.min(1, CAMERA_YAW_LERP * rotateMul * dt)
      camYaw += THREE.MathUtils.clamp(yawStep, -MAX_CAM_YAW_RATE * dt, MAX_CAM_YAW_RATE * dt)

      // 인트로 돌리 — 멀리서(줌아웃 12) 시작해 6초에 걸쳐 제자리로(원본 easeInOut3).
      // 벽시계 기반이라 로딩 히칭이 있어도 정확히 6초 동안 확대된다.
      let introZoom = 0
      if (introSec >= 0 && introSec < INTRO_DURATION) {
        introActive = true
        const it = introSec / INTRO_DURATION
        const eased = it < 0.5 ? 4 * it * it * it : 1 - Math.pow(-2 * it + 2, 3) / 2
        introZoom = INTRO_ZOOM * (1 - eased)
      } else {
        introActive = false
      }
      toCam.set(Math.sin(camYaw), 0, Math.cos(camYaw))
      // 시선 목표점 — 캐릭터보다 살짝 위(1.2)와 전방(0.5)(원본 lookatMeshOffset).
      // 카메라는 이 점을 중심으로 한 구면 위에 선다.
      lookAt.set(
        position.x - toCam.x * CAMERA_LOOK_FORWARD,
        position.y + CAMERA_LOOK_HEIGHT,
        position.z - toCam.z * CAMERA_LOOK_FORWARD,
      )

      // idle 흔들림("살랑살랑") — touchAmount(0→1)로 서서히 켜지는 사인노이즈.
      // 원본 실측상 흔들리는 동안 카메라 위치는 완전히 고정이고 시선만 돈다 →
      // 궤도가 아니라 lookAt 이후의 회전으로 얹는다. 인트로 중엔 0.
      const touchAmount =
        introSec < 0
          ? 0
          : THREE.MathUtils.clamp(
              (introSec - SHAKE_FADE_DELAY) / SHAKE_FADE_DURATION,
              0,
              1,
            )
      const swayTheta =
        sineNoise1(12.23, 3.44, -3.234 + clock * SHAKE_SPEED) * SHAKE_THETA * touchAmount
      const swayPhi =
        sineNoise1(-2.45, 4.789, 7.343 + clock * SHAKE_SPEED) * SHAKE_PHI * touchAmount
      const swayRoll =
        sineNoise1(1.5, 2.5, 8.454 + clock * SHAKE_SPEED) * SHAKE_ROLL * touchAmount

      // 패시브 마우스 패럴랙스 — 커서 위치로 카메라를 은은히 둘러본다. camYaw(자동
      // 추종)와 분리된 순수 시점 오프셋이라 이동 방향에 되먹임되지 않는다. 인트로
      // 이후 touchAmount로 서서히 켜지고, 목표값으로 부드럽게 수렴한다.
      const parTargetYaw = -pointer.x * PARALLAX_YAW * touchAmount
      const parTargetPitch = -pointer.y * PARALLAX_PITCH * touchAmount
      parYaw += (parTargetYaw - parYaw) * Math.min(1, PARALLAX_LERP * dt)
      parPitch += (parTargetPitch - parPitch) * Math.min(1, PARALLAX_LERP * dt)

      // 시선 목표점 기준 구면 방향(앙각 고정). 패럴랙스만 궤도로 얹는다.
      camSpherical.set(1, Math.PI / 2 - CAMERA_ELEVATION, camYaw)
      const basePhi = camSpherical.phi
      camSpherical.theta += parYaw
      // 위로 젖히는 방향(phi 증가)만 좁게 잘라 바다가 전경에 새는 것을 원천 차단.
      // 아래로 내려다보는 방향(phi 감소)은 안전하므로 넉넉히 허용한다.
      camSpherical.phi = THREE.MathUtils.clamp(
        basePhi + parPitch,
        basePhi - CAM_PHI_DOWN,
        basePhi + CAM_PHI_UP,
      )
      camOffset.setFromSpherical(camSpherical)
      // 벽 충돌로 줄인 반경에 인트로 줌을 더한다 — 원본 followSphericalZoom처럼
      // 같은 광선을 따라 멀어지므로 인트로 내내 시선 각도가 변하지 않는다.
      const radius = cameraRadius(lookAt, camOffset, CAMERA_RADIUS) + introZoom
      desiredCam.copy(lookAt).addScaledVector(camOffset, radius)

      // 인트로 중엔 돌리를 정확히 따라가고(스냅), 이후엔 부드럽게 추적한다
      if (introActive) camera.position.copy(desiredCam)
      else camera.position.lerp(desiredCam, Math.min(1, CAMERA_LERP * dt))
      // 아주 미세한 롤(수평선 기울기)까지 원본 흔들림에 맞춘다
      viewDir.copy(lookAt).sub(camera.position).normalize()
      camera.up.set(0, 1, 0).applyAxisAngle(viewDir, swayRoll)
      camera.lookAt(lookAt)
      // 흔들림은 위치를 건드리지 않는 순수 회전(요우는 월드 Y, 피치는 로컬 X)
      camera.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, swayTheta)
      camera.rotateX(swayPhi)
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
