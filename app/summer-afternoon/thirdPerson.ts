import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { sineNoise1 } from './noise'
import type { TouchState } from './touchCircles'

/**
 * 원본과 같은 3인칭 조작 — 원본 controls·collisionPhysics·followCamera를 뜯어
 * 같은 수식과 상수로 옮겼다.
 *
 * - 입력: WASD·방향키 + 마우스 가상 조이스틱(화면 고정점 기준) + 터치 조이스틱
 *   (누른 자리 기준, 탭하면 점프) + 게임패드. 카메라는 유저가 직접 못 돌리고
 *   (원본 enableRotate=false) 캐릭터 등 뒤로 알아서 돌아온다.
 * - 이동: 속도를 바로 정하지 않고 입력만큼 가속한 뒤 매 프레임 감쇠한다(관성).
 *   ≈0.5s에 걸쳐 최고 속도 ≈3.75m/s에 이르고, 손을 떼면 ≈0.7m 미끄러져 선다.
 * - 충돌: 캐릭터를 캡슐로 보고 collider.bin과 겹친 만큼 밀어낸다(원본과 같은
 *   three-mesh-bvh). 벽을 따라 미끄러지고, 낮은 턱만 넘고, 난간에서는 떨어진다.
 * - 카메라: 캐릭터 방향 → 목표 방위 → 실제 방위의 2단 스무딩으로 느리게 돌고,
 *   시선 목표점은 캐릭터를 살짝 늦게 따라간다.
 *
 * 원본 상수는 모두 "60fps 한 프레임" 단위라 lerp·감쇠·적분을 실제 프레임 길이
 * (ratio = dt×60)로 환산한다 — 원본 lerpCoefFPS·frictionFPS·ratioFPS와 같다.
 */

// ── 이동 물리(원본 collisionPhysics) — 속도는 m/프레임, 가속은 m/프레임² ──
/** 입력 1당 가속(원본 positionForce .005). 감쇠와 맞물려 최고 속도 ≈3.75m/s */
const POSITION_FORCE = 0.005
/** 프레임당 속도 감쇠(원본 damp .92) — 출발·정지의 관성을 만든다 */
const DAMP = 0.92
/** 원본 gravity(≈ -35m/s²). 감쇠까지 받아 점프가 짧고 경쾌하다 */
const GRAVITY = -0.009832
/** 원본 jumpForce — 높이 ≈1.08m, 체공 ≈0.52s */
const JUMP_FORCE = 0.2
/** 한 프레임을 나눠 충돌을 푸는 횟수(원본 substeps, 최소 3) */
const SUBSTEPS = 4
/** 캡슐 반경 = 키 × 0.2(원본 radiusPercentage) */
const RADIUS_PERCENTAGE = 0.2
/** 법선 y가 이보다 크면 바닥으로 본다(원본 floorDetectInclination .8) */
const FLOOR_NORMAL_Y = 0.8
/** 발밑이 이보다 떠 있어야 공중 모션으로 바꾼다(원본 0.2m) */
const AIR_DISTANCE = 0.2
/** 바닥을 떠나고 이 시간이 지나야 공중으로 확정한다(원본 45ms) — 요철에서 깜빡임 방지 */
const AIR_DELAY = 0.045
/** 월드 최저점보다 이만큼 떨어지면 시작 지점으로 되돌린다(원본 fallLimitDistance) */
const FALL_LIMIT = 10
/** 시작 지점을 이 반경(정육면체) 안에서 무작위로 고른다(원본 initialRadius 4) */
const SPAWN_RADIUS = 4
/** 이만큼 가만히 있으면 심심해하는 모션으로 바꾼다(원본 inactiveTime 60s) */
const INACTIVE_MS = 60_000

// ── 캐릭터 방향 ──
/** 목표 방향이 입력 방향으로 도는 비율(원본 directionLerp .075) */
const DIRECTION_LERP = 0.075
/** 실제 방향이 목표 방향을 따라가는 비율(원본 rotationCharLerp .4) */
const ROTATION_LERP = 0.4
/** 이 수평 속도(m/프레임) 사이에서 방향을 실제 속도 쪽으로도 맞춘다(원본 rotVelocityMin/Max) */
const ROT_VELOCITY_MIN = 0.0035
const ROT_VELOCITY_MAX = 0.02

// ── 입력(원본 controls) ──
/**
 * 원본 가상 조이스틱 — 클릭 지점이 아니라 화면의 "고정점" 기준이다.
 * 원본 mouseCenter (0, -0.45): 가로 중앙, 세로는 위에서 72.5% 지점(≈캐릭터
 * 발밑). 커서가 이 점에서 얼마나 떨어졌는지로 이동 방향·세기가 정해지고,
 * controlMouseAmount(200px)에서 최대가 된다. 그래서 "클릭하면 그 방향으로
 * 곧장 이동"하고, 누른 채 커서를 옮기면 방향이 바뀐다(원본과 동일).
 */
const CONTROL_MOUSE_AMOUNT = 200
const MOUSE_CENTER_Y_FRAC = 0.725
/** 터치는 누른 자리에서 이만큼(px) 끌면 최대 세기(원본 controlTouchAmount 75) */
const CONTROL_TOUCH_AMOUNT = 75
/** 이보다 짧게(px·초) 누르고 떼면 탭 — 터치 탭은 점프다(원본 CLICK_DISTANCE·CLICK_TIME) */
const TAP_DISTANCE = 15
const TAP_TIME_MS = 750
/** 점프 요청이 유효한 시간(원본 75ms) — 착지 직전에 눌러도 착지하자마자 뛴다 */
const JUMP_REQUEST_MS = 75
/** 오른쪽 버튼을 이보다 짧게 눌렀다 떼면 점프(원본 0.5s) */
const RIGHT_CLICK_MS = 500
/** 인트로 시작 후 조작을 받기 시작하는 시점(원본 delayedCall 1.5s) */
const CONTROLS_DELAY = 1.5

// ── 카메라(원본 followCamera·orbitCamera·baseCamera) ──
// 발끝 기준 카메라 상대 위치(원본 relativeCameraPosition (0, 1, -5.75))를 시선
// 목표점 중심 구면좌표로 바꾼 값 — 반경 5.836m, 극각 80.134°(=앙각 9.866°).
// 인트로 줌·벽 충돌은 반경만 바꾸므로 내내 같은 각도로 내려다본다.
const CAMERA_DISTANCE = Math.hypot(1, 5.75)
const CAMERA_PHI = Math.acos(1 / CAMERA_DISTANCE)
/** 시선 목표점 = 발 위 1.1m, 캐릭터 정면 0.5m(원본 lookatMeshOffset) */
const LOOK_OFFSET = new THREE.Vector3(0, 1.1, 0.5)
/** 시선 오프셋이 캐릭터 방향을 따라 도는 비율(원본 .0125) */
const LOOK_OFFSET_LERP = 0.0125
/** 시선 목표점이 캐릭터를 따라가는 비율(원본 lerpPan — 데스크톱 .15, 모바일 .175) */
const PAN_LERP = 0.15
const PAN_LERP_MOBILE = 0.175
/** 목표 방위가 캐릭터 등 뒤로 도는 비율(원본 cameraRotationLerp .03) */
const CAMERA_ROTATION_LERP = 0.03
/** 이동 입력이 없을 때의 회전 배수(원본 cameraInactiveMultiplier .025) */
const CAMERA_INACTIVE_MUL = 0.025
/** 실제 방위가 목표 방위를 따라가는 비율(원본 lerpRotate .075) — 2단 스무딩 */
const ROTATE_LERP = 0.075
/** 반경이 목표(벽 충돌·인트로 줌)를 따라가는 비율(원본 lerpZoom .05) */
const ZOOM_LERP = 0.05
/**
 * 인트로 카메라 돌리 — 멀리서(줌아웃) 시작해 제자리로 당겨온다.
 * 원본 playIntroAnimation: followSphericalZoom 12 → 0, 6s, ease "inOut3".
 */
const INTRO_ZOOM = 12
const INTRO_DURATION = 6
/**
 * 커서 패럴랙스 — 드래그와 무관하게 커서 위치(±1)에 π/2와 이 배수를 곱한 만큼
 * 카메라가 시선 목표점을 중심으로 궤도를 돈다(원본 displacement.position
 * (-.075, -.05) → 최대 요우 ±0.118rad, 피치 ±0.079rad). 이동 방향 계산에는
 * 쓰지 않는 순수 시점 오프셋이다. 터치는 손을 떼면 절반 속도로 가운데로 돌아오고
 * (원본 resetOnTouch), 모바일은 위아래 패럴랙스가 없다.
 */
const PARALLAX_THETA = -0.075
const PARALLAX_PHI = -0.05
/** 패럴랙스가 커서를 따라가는 비율(원본 lerpPosition .035) */
const PARALLAX_LERP = 0.035
/**
 * idle 카메라 흔들림("살랑살랑") — 원본 setupCamera: shake(.08,.08,.02),
 * shakeSpeed .2. 카메라 위치는 그대로 두고 시선 방향만 사인노이즈로 돌린다.
 * 패럴랙스와 함께 touchAmount(0→1)로 서서히 켜진다(원본 delay 4s, 4s).
 */
const SHAKE_THETA = 0.08
const SHAKE_PHI = 0.08
const SHAKE_ROLL = 0.02
const SHAKE_SPEED = 0.2
const SHAKE_FADE_DELAY = 4
const SHAKE_FADE_DURATION = 4
/** 카메라 극각이 뒤집히지 않게 두는 여유(원본 EPS) */
const PHI_EPS = 1e-6

const UP = new THREE.Vector3(0, 1, 0)

/** 원본 lerpCoefFPS — 60fps 기준 프레임당 비율 k를 ratio 프레임만큼 적용한 계수 */
function lerpCoef(k: number, ratio: number): number {
  return 1 - Math.pow(1 - k, ratio)
}

/** -PI..PI로 감싼 최단 각도차 */
function shortestAngle(delta: number): number {
  return THREE.MathUtils.euclideanModulo(delta + Math.PI, Math.PI * 2) - Math.PI
}

/** 원본 math.fit — 입력을 [a, b]로 자른 뒤 [c, d]로 선형 매핑 */
function fit(v: number, a: number, b: number, c: number, d: number): number {
  return THREE.MathUtils.mapLinear(
    THREE.MathUtils.clamp(v, Math.min(a, b), Math.max(a, b)),
    a,
    b,
    c,
    d,
  )
}

/** 원본 CustomEase "inOut3" = cubic-bezier(0.6, 0, 0, 1). x(s)를 이분법으로 푼다 */
function easeInOut3(t: number): number {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const s = (lo + hi) / 2
    if (1.8 * (1 - s) * (1 - s) * s + s * s * s < t) lo = s
    else hi = s
  }
  const s = (lo + hi) / 2
  return s * s * (3 - 2 * s)
}

/** gsap 기본 이징 power2.inOut(=cubic) — 원본 touchAmount 트윈은 이징 지정 없이 기본값을 쓴다 */
function easePower2InOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** 원본 gamepadAxisNormalize — 0.15~0.25 사이 데드존을 부드럽게 넘긴다 */
function gamepadAxis(value = 0): number {
  return value * THREE.MathUtils.smoothstep(Math.abs(value), 0.15, 0.25)
}

export interface ThirdPerson {
  update(dt: number): void
  dispose(): void
  /** 인트로 카메라 돌리를 시작한다(멀리서 제자리로) */
  startIntro(): void
  /** 조작을 켜고 끈다 — 원본은 정보 모달이 떠 있는 동안 조작을 끈다 */
  setEnabled(enabled: boolean): void
  /** 그 자리(바닥 위)로 곧장 옮긴다 — 카메라도 같은 만큼 옮겨 따라오게 한다(휴대폰 GPS가 멀리 튀었을 때) */
  snap(x: number, z: number): void
  /** 수평 속도 — 원본 velocityHorizontal(60fps 한 프레임당 m). 잔디 반응·애니메이션 블렌드용 */
  velocityHorizontal: number
  /** 이동 입력이 들어오고 있는가 */
  moving: boolean
  /** 공중 모션 상태 (kid-air 재생용) */
  airborne: boolean
  /** 60초 넘게 가만히 있어 심심해하는 상태 (kid-bored 재생용) */
  bored: boolean
  /** 카메라가 바라보는 점(흔들림 포함) — 동적 그림자 중심을 여기에 맞춘다 */
  readonly target: THREE.Vector3
  /** 터치 조이스틱 상태 — 화면 원 UI가 읽는다 */
  readonly touch: TouchState
}

export function createThirdPerson({
  camera,
  character,
  collider,
  domElement,
  start,
  mobile,
  onTouchJump,
  steer,
}: {
  camera: THREE.PerspectiveCamera
  character: THREE.Mesh
  collider: THREE.Mesh
  domElement: HTMLElement
  start: THREE.Vector3
  /** 휴대폰 — 카메라가 조금 더 빨리 따라오고 위아래 패럴랙스가 없다(원본 client.device) */
  mobile: boolean
  /** 두 번째 손가락으로 탭해 점프했을 때 그 자리(NDC)를 알린다(점프 원 UI) */
  onTouchJump?: (ndc: THREE.Vector2) => void
  /** 바깥에서 주는 월드 방향 입력(x 동·z 남, 길이 0~1) — 휴대폰 GPS 따라가기. 없으면 null */
  steer?: () => { x: number; z: number } | null
}): ThirdPerson {
  const keys = { forward: false, back: false, left: false, right: false }
  // drag = 이동 조이스틱 방향·세기(길이 0~1). (x: +우 / y: +아래)
  // 마우스는 화면 고정점 기준, 터치는 처음 누른 자리 기준이다.
  const drag = new THREE.Vector2()
  // 커서(터치는 첫 손가락)의 화면상 정규화 위치([-1,1], y는 아래가 +) — 패럴랙스용
  const pointer = new THREE.Vector2(0, 0)
  let dragging = false
  let enabled = true
  // 원본 touches — 손가락 두 개까지 따로 추적한다(0번이 이동, 1번은 탭 점프만)
  const fingers: ({ id: number; x: number; y: number; startMs: number } | null)[] = [null, null]
  // 첫 손가락 마지막 입력이 터치였는가(원본 resetOnTouch — 떼면 패럴랙스가 가운데로 돌아온다)
  let touchInput = false
  let gamepadJump = false
  let inactiveMs = 0
  const touch: TouchState = { active: false, start: new THREE.Vector2(), delta: new THREE.Vector2() }
  // 스페이스를 누르고 있어도 한 번만 뛴다(원본 _jumpKeyLocked — 키 반복 무시)
  let jumpLocked = false
  let jumpRequestUntil = 0
  let rightDownMs = -Infinity
  // 인트로·흔들림은 벽시계(performance.now)로 구동한다 — 에셋 로딩 직후 첫
  // 프레임의 큰 dt가 누적돼 인트로가 통째로 스킵되던 문제를 막는다.
  let introStartMs = -1
  let clockBaseMs = -1

  // 충돌 — 원본처럼 collider를 BVH로 만들어 캡슐 충돌·레이캐스트에 쓴다.
  // (표준 Raycaster는 5만 삼각형을 전부 훑어 프레임당 여러 번 쏘기엔 느리다.)
  const bvh = new MeshBVH(collider.geometry)
  collider.geometry.computeBoundingBox()
  const worldMinY = collider.geometry.boundingBox!.min.y
  // 캡슐은 발끝에서 시작한다. 반경 = 키 × 0.2, 나머지가 두 구 사이 선분이다.
  // (스킨드 메시는 첫 렌더 전 본 행렬이 비어 있어 지오메트리 bbox로 잰다)
  character.geometry.computeBoundingBox()
  const height = character.geometry.boundingBox!.max.y - character.geometry.boundingBox!.min.y
  const capsuleRadius = height * RADIUS_PERCENTAGE
  const capsuleLength = height - capsuleRadius * 2

  // 시작 지점 — 원본 setInitialPosition처럼 start 주변 ±4m 정육면체에서 한 점을 고르고
  // collider 표면의 최근접점에 세운다(접속할 때마다 조금씩 다른 자리에서 시작한다)
  const spawn = start
    .clone()
    .add(
      new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .multiplyScalar(SPAWN_RADIUS),
    )
  const initialPosition = bvh.closestPointToPoint(spawn)?.point.clone() ?? spawn
  const position = initialPosition.clone()
  const velocity = new THREE.Vector3()
  const accel = new THREE.Vector3()
  let onFloor = false
  // 공중 판정(원본 _detectJump) — 바닥에 있다고 보는지, 바닥을 떠난 시각
  let grounded = false
  let offFloorSince = -1

  // 캐릭터 방위 — 원본 spherical.theta는 "캐릭터 등 뒤" 방향이다(= rotation.y + π).
  // 목표 방위가 입력을 따라 돌고, 실제 방위가 목표를 따라간다.
  let charTheta = character.rotation.y + Math.PI
  let charThetaTarget = charTheta

  // 카메라 — 목표 방위가 캐릭터 등 뒤를 따라 돌고, 실제 방위가 목표를 따라간다.
  // 카메라는 시선 목표점을 중심으로 한 구면(반경·극각 고정)에 선다.
  let camTheta = charTheta
  let camThetaTarget = charTheta
  let radius = CAMERA_DISTANCE
  let radiusTarget = CAMERA_DISTANCE
  let parTheta = 0
  let parPhi = 0
  const lookOffset = LOOK_OFFSET.clone().applyAxisAngle(UP, charTheta + Math.PI)
  const lookTarget = position.clone().add(lookOffset)
  const basePosition = new THREE.Vector3()
    .setFromSphericalCoords(radius, CAMERA_PHI, camTheta)
    .add(lookTarget)

  const ray = new THREE.Ray()
  const segment = new THREE.Line3()
  const segmentStart = new THREE.Vector3()
  const capsuleBox = new THREE.Box3()
  const triPoint = new THREE.Vector3()
  const segPoint = new THREE.Vector3()
  const triNormal = new THREE.Vector3()
  const push = new THREE.Vector3()
  const offsetGoal = new THREE.Vector3()
  const panTarget = new THREE.Vector3()
  const lookPoint = new THREE.Vector3()
  const back = new THREE.Vector3()
  const right = new THREE.Vector3()
  const spherical = new THREE.Spherical()

  /** 원본 _requestJump — 누를 때 한 번 요청하고, 요청은 75ms 동안만 유효하다 */
  const requestJump = (pressed: boolean) => {
    if (!pressed) {
      jumpLocked = false
      return
    }
    if (jumpLocked) return
    jumpLocked = true
    jumpRequestUntil = performance.now() + JUMP_REQUEST_MS
  }

  const onKey = (e: KeyboardEvent) => {
    if (!enabled) return
    const pressed = e.type === 'keydown'
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.forward = pressed; break
      case 'KeyS': case 'ArrowDown': keys.back = pressed; break
      case 'KeyA': case 'ArrowLeft': keys.left = pressed; break
      case 'KeyD': case 'ArrowRight': keys.right = pressed; break
      case 'Space': requestJump(pressed); break
      default: return
    }
    e.preventDefault()
  }

  // 화면 고정점(가로 중앙, 세로 72.5%)에서 커서까지의 거리를 이동 입력으로
  // 환산한다(원본 mouseCenter 방식). 200px에서 최대, 길이는 1로 클램프.
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

  // 터치 조이스틱 — 처음 누른 자리에서 75px 끌면 최대(원본 touchDelta = -dragged / 75)
  const updateTouchDrag = (dx: number, dy: number) => {
    drag.set(dx, dy).divideScalar(CONTROL_TOUCH_AMOUNT)
    if (drag.length() > 1) drag.normalize()
    touch.delta.set(-drag.x, -drag.y)
  }

  const capture = (pointerId: number) => {
    try {
      domElement.setPointerCapture(pointerId)
    } catch {
      /* 합성 이벤트 등 활성 포인터가 없으면 캡처 생략 */
    }
  }
  const release = (pointerId: number) => {
    try {
      domElement.releasePointerCapture(pointerId)
    } catch {
      /* 활성 포인터가 없으면 무시 */
    }
  }

  // 마우스 왼쪽 버튼 = 커서 방향 이동(누르는 즉시). pointerdown은 처음 누른 버튼에만
  // 오므로(다른 버튼을 겹쳐 누르면 pointermove) 드래그는 왼쪽 버튼으로 시작할 때만 된다.
  // 터치는 손가락마다 따로 오고, 첫 손가락만 이동 조이스틱이 된다.
  const onDown = (e: PointerEvent) => {
    if (!enabled) return
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
      dragging = true
      touchInput = false
      // 클릭 즉시 그 방향으로 이동(원본과 동일 — 눌린 순간 touchDelta 계산)
      updateDrag(e.clientX, e.clientY)
      capture(e.pointerId)
      return
    }
    const slot = fingers[0] === null ? 0 : fingers[1] === null ? 1 : -1
    if (slot < 0) return
    if (fingers[0] === null && fingers[1] === null) capture(e.pointerId)
    fingers[slot] = { id: e.pointerId, x: e.clientX, y: e.clientY, startMs: performance.now() }
    if (slot !== 0) return
    touchInput = true
    dragging = true
    touch.active = true
    const rect = domElement.getBoundingClientRect()
    touch.start.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    )
    updatePointer(e.clientX, e.clientY)
    updateTouchDrag(0, 0)
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      // 패럴랙스는 드래그 여부와 무관하게 커서를 따라간다
      updatePointer(e.clientX, e.clientY)
      if (dragging && !touchInput) updateDrag(e.clientX, e.clientY)
      return
    }
    const first = fingers[0]
    if (!first || first.id !== e.pointerId) return
    updatePointer(e.clientX, e.clientY)
    updateTouchDrag(e.clientX - first.x, e.clientY - first.y)
  }
  // 마우스 pointerup은 모든 버튼을 뗐을 때 온다 — 원본 touch_end처럼 드래그를 끝낸다.
  // 터치는 짧게 누르고 뗀 탭이면 점프한다(두 번째 손가락 탭은 그 자리에 점프 원).
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (touchInput) return
      dragging = false
      drag.set(0, 0)
      release(e.pointerId)
      return
    }
    const slot = fingers.findIndex((f) => f?.id === e.pointerId)
    if (slot < 0) return
    const finger = fingers[slot]!
    fingers[slot] = null
    if (slot === 0) {
      dragging = false
      touch.active = false
      drag.set(0, 0)
      touch.delta.set(0, 0)
    }
    const tapped =
      e.type === 'pointerup' &&
      Math.hypot(e.clientX - finger.x, e.clientY - finger.y) < TAP_DISTANCE &&
      performance.now() - finger.startMs < TAP_TIME_MS
    if (tapped && enabled) {
      requestJump(true)
      requestJump(false)
      if (slot !== 0 && onTouchJump) {
        const rect = domElement.getBoundingClientRect()
        onTouchJump(
          new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -(((e.clientY - rect.top) / rect.height) * 2 - 1),
          ),
        )
      }
    }
    if (fingers[0] === null && fingers[1] === null) release(e.pointerId)
  }
  // 오른쪽 버튼 = 짧게 눌렀다 떼면 점프(원본 _mouseDown/_mouseUp). 버튼마다
  // 이벤트가 오는 mouse 이벤트로 받아 왼쪽 드래그 중에도 뛸 수 있다.
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 2) rightDownMs = performance.now()
  }
  const onMouseUp = (e: MouseEvent) => {
    if (!enabled || e.button !== 2 || performance.now() - rightDownMs >= RIGHT_CLICK_MS) return
    requestJump(true)
    requestJump(false)
  }
  const onContextMenu = (e: Event) => e.preventDefault()
  // 창이 포커스를 잃으면 눌린 키·드래그를 모두 푼다(원본 _endInteraction) —
  // 키를 누른 채 다른 창으로 가도 캐릭터가 계속 걷지 않게 한다.
  const endInteraction = () => {
    keys.forward = keys.back = keys.left = keys.right = false
    jumpLocked = false
    gamepadJump = false
    dragging = false
    drag.set(0, 0)
    fingers[0] = fingers[1] = null
    touch.active = false
    touch.delta.set(0, 0)
  }
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') endInteraction()
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  window.addEventListener('blur', endInteraction)
  document.addEventListener('visibilitychange', onVisibility)
  domElement.addEventListener('pointerdown', onDown)
  domElement.addEventListener('pointermove', onMove)
  domElement.addEventListener('pointerup', onUp)
  domElement.addEventListener('pointercancel', onUp)
  domElement.addEventListener('mousedown', onMouseDown)
  domElement.addEventListener('mouseup', onMouseUp)
  domElement.addEventListener('contextmenu', onContextMenu)

  /**
   * 캡슐을 한 걸음(h 프레임분) 옮기고 겹친 삼각형마다 밀어낸다(원본 _substep).
   * 밀려난 방향의 속도 성분을 지워 벽에서는 미끄러지고 바닥에서는 선다.
   */
  function substep(h: number) {
    position.addScaledVector(velocity, h)
    segment.start.set(position.x, position.y + capsuleRadius, position.z)
    segment.end.set(position.x, position.y + capsuleRadius + capsuleLength, position.z)
    segmentStart.copy(segment.start)
    capsuleBox.makeEmpty()
    capsuleBox.expandByPoint(segment.start)
    capsuleBox.expandByPoint(segment.end)
    capsuleBox.min.addScalar(-capsuleRadius)
    capsuleBox.max.addScalar(capsuleRadius)

    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(capsuleBox),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(segment, triPoint, segPoint)
        if (distance >= capsuleRadius) return false
        // 아래 구가 위로 밀려났고 삼각형이 완만하면 바닥에 서 있는 것이다
        const atBottom = segPoint.equals(segment.start)
        const dir = segPoint.sub(triPoint).normalize()
        const depth = capsuleRadius - distance
        segment.start.addScaledVector(dir, depth)
        segment.end.addScaledVector(dir, depth)
        if (atBottom && dir.y > 0 && tri.getNormal(triNormal).y > FLOOR_NORMAL_Y) onFloor = true
        return false
      },
    })

    push.subVectors(segment.start, segmentStart)
    const amount = Math.max(0, push.length() - 1e-5 * h)
    push.normalize()
    position.addScaledVector(push, amount)
    velocity.addScaledVector(push, -push.dot(velocity))
  }

  /**
   * 원본 followCamera → orbitCamera → baseCamera 한 프레임. 원본처럼 캐릭터
   * 물리보다 먼저, 직전 프레임의 캐릭터 상태로 갱신한다.
   */
  function updateCamera(ratio: number, clock: number, introSec: number) {
    // 시선 목표점 — 발 위 1.1m·캐릭터 정면 0.5m. 오프셋은 캐릭터 방향을 따라 아주
    // 느리게 돌고, 목표점 자체는 캐릭터를 살짝 늦게 따라간다.
    offsetGoal.copy(LOOK_OFFSET).applyAxisAngle(UP, charTheta + Math.PI)
    lookOffset.lerp(offsetGoal, lerpCoef(LOOK_OFFSET_LERP, ratio))
    panTarget.copy(position).add(lookOffset)

    // 목표 방위는 캐릭터 등 뒤(charTheta)로 돈다. 배수가 핵심이다: 캐릭터가
    // 카메라 쪽으로 곧장 걸어오면(정반대) 배수 0이라 카메라가 안 돈다. 이게
    // 없으면 "카메라가 돌면 이동 방향이 또 바뀌는" 되먹임으로 화면이 계속 돈다.
    const alignment = Math.cos(charThetaTarget - camTheta)
    const rotateMul = state.moving
      ? THREE.MathUtils.clamp(alignment + 1, 0, 1)
      : CAMERA_INACTIVE_MUL
    camThetaTarget +=
      shortestAngle(charTheta - camThetaTarget) *
      lerpCoef(CAMERA_ROTATION_LERP * rotateMul, ratio)

    // 시선 목표점 → 카메라 사이에 벽이 끼면 반경을 줄인다(맞은 거리의 90%,
    // 최소 캡슐 반경 × 1.25). 인트로 줌은 같은 광선 위로 반경만 더한다.
    ray.origin.copy(lookTarget)
    ray.direction.subVectors(basePosition, lookTarget).normalize()
    const hit = bvh.raycastFirst(ray, THREE.FrontSide)
    radiusTarget =
      hit && hit.distance < CAMERA_DISTANCE
        ? Math.max(capsuleRadius * 1.25, hit.distance * 0.9)
        : CAMERA_DISTANCE
    if (introSec >= 0 && introSec < INTRO_DURATION) {
      radiusTarget += INTRO_ZOOM * (1 - easeInOut3(introSec / INTRO_DURATION))
    }

    // 2단 스무딩 — 실제 방위·반경·시선 목표점이 각자 목표를 따라간다
    camTheta += (camThetaTarget - camTheta) * lerpCoef(ROTATE_LERP, ratio)
    radius += (radiusTarget - radius) * lerpCoef(ZOOM_LERP, ratio)
    lookTarget.lerp(panTarget, lerpCoef(mobile ? PAN_LERP_MOBILE : PAN_LERP, ratio))
    basePosition.setFromSphericalCoords(radius, CAMERA_PHI, camTheta).add(lookTarget)

    // 패럴랙스·흔들림 세기 — 인트로 시작 4초 뒤부터 4초에 걸쳐 켜진다
    const touchAmount =
      introSec < 0
        ? 0
        : easePower2InOut(
            THREE.MathUtils.clamp((introSec - SHAKE_FADE_DELAY) / SHAKE_FADE_DURATION, 0, 1),
          )

    // 패럴랙스 — 커서 위치만큼 시선 목표점을 중심으로 궤도를 돈다. 터치를 뗀 뒤에는
    // 가운데로 절반 속도로 돌아온다(원본 resetOnTouch).
    const released = touchInput && !touch.active
    const parallaxX = released ? 0 : pointer.x
    const parallaxY = released || mobile ? 0 : pointer.y
    const parallaxLerp = lerpCoef(PARALLAX_LERP * (released ? 0.5 : 1), ratio)
    parTheta += (parallaxX * Math.PI * 0.5 * PARALLAX_THETA * touchAmount - parTheta) * parallaxLerp
    parPhi += (parallaxY * Math.PI * 0.5 * PARALLAX_PHI * touchAmount - parPhi) * parallaxLerp
    camera.position.setFromSphericalCoords(
      radius,
      THREE.MathUtils.clamp(CAMERA_PHI + parPhi, PHI_EPS, Math.PI - PHI_EPS),
      camTheta + parTheta,
    )
    camera.position.add(lookTarget)

    // 흔들림 — 궤도 위치(basePosition)에서 시선 목표점을 보는 방향만 돌린다
    const swayTheta = sineNoise1(12.23, 3.44, -3.234 + clock * SHAKE_SPEED) * SHAKE_THETA * touchAmount
    const swayPhi = sineNoise1(-2.45, 4.789, 7.343 + clock * SHAKE_SPEED) * SHAKE_PHI * touchAmount
    const swayRoll = sineNoise1(23.434, -1.565, 8.454 + clock * SHAKE_SPEED) * SHAKE_ROLL * touchAmount
    spherical.setFromVector3(lookPoint.subVectors(lookTarget, basePosition))
    spherical.theta += swayTheta
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + swayPhi, PHI_EPS, Math.PI - PHI_EPS)
    lookPoint.setFromSpherical(spherical).add(basePosition)

    // 아주 미세한 롤(수평선 기울기) — 위쪽 벡터를 카메라 오른쪽으로 살짝 기울인다
    back.subVectors(basePosition, lookTarget).normalize()
    right.crossVectors(UP, back).normalize()
    camera.up.copy(UP).addScaledVector(right, swayRoll).normalize()
    camera.lookAt(lookPoint)
  }

  /** 원본 collisionPhysics._update 한 프레임 — 가속 → 적분·충돌 → 감쇠 → 공중·점프 판정 */
  function updatePhysics(ratio: number, clock: number, forward: number, strafe: number) {
    if (state.moving) {
      // 카메라 방위 기준으로 가속한다 — 전진은 카메라에서 멀어지는 방향
      accel.set(
        -Math.sin(camTheta) * forward + Math.cos(camTheta) * strafe,
        0,
        -Math.cos(camTheta) * forward - Math.sin(camTheta) * strafe,
      )
      // 목표 방위는 입력 방향(의 등 뒤)으로 서서히 돈다
      const inputTheta = Math.atan2(accel.x, accel.z) + Math.PI
      charThetaTarget +=
        (charTheta + shortestAngle(inputTheta - charTheta) - charThetaTarget) *
        lerpCoef(DIRECTION_LERP, ratio)
      accel.multiplyScalar(POSITION_FORCE)
    }
    if (!onFloor) accel.y += GRAVITY
    charTheta += (charThetaTarget - charTheta) * lerpCoef(ROTATION_LERP, ratio)
    character.rotation.y = charTheta + Math.PI

    velocity.addScaledVector(accel, ratio)
    accel.set(0, 0, 0)
    // 한 걸음이 캡슐 반경을 넘지 않게 나눠 움직인다(벽 관통 방지)
    const steps = Math.max(Math.round(ratio * SUBSTEPS), 3)
    velocity.clampLength(0, steps * capsuleRadius * 0.9)
    onFloor = false
    for (let i = 0; i < steps; i++) substep(ratio / steps)
    velocity.multiplyScalar(Math.pow(DAMP, ratio))

    // 실제로 움직이는 방향으로도 몸을 돌린다(벽에 밀려 미끄러질 때 자연스럽다)
    state.velocityHorizontal = Math.hypot(velocity.x, velocity.z)
    if (state.velocityHorizontal > ROT_VELOCITY_MIN) {
      const velocityTheta = Math.atan2(velocity.x, velocity.z) + Math.PI
      const k =
        DIRECTION_LERP *
        fit(state.velocityHorizontal, ROT_VELOCITY_MIN, ROT_VELOCITY_MAX, 0, 1)
      charThetaTarget += shortestAngle(velocityTheta - charThetaTarget) * lerpCoef(k, ratio)
    }

    // 공중 판정 — 바닥을 45ms 넘게 떠났고 발밑이 0.2m보다 떠 있을 때만 공중이다.
    // 떨어지다 땅이 0.2m 안으로 가까워지면 착지 전에 미리 공중 모션을 푼다.
    ray.origin.set(position.x, position.y + 0.001, position.z)
    ray.direction.set(0, -1, 0)
    const ground = bvh.raycastFirst(ray, THREE.FrontSide)
    const high = !ground || ground.distance > AIR_DISTANCE
    if (grounded !== onFloor) {
      if (!grounded) {
        grounded = true
        state.airborne = false
      } else if (offFloorSince < 0) {
        offFloorSince = clock
      } else if (clock - offFloorSince > AIR_DELAY && high) {
        grounded = false
        offFloorSince = -1
        state.airborne = true
      }
    } else {
      offFloorSince = -1
    }
    if (!grounded) state.airborne = high
    if (state.airborne) state.bored = false
    if (performance.now() < jumpRequestUntil && onFloor) {
      jumpRequestUntil = 0
      velocity.y += JUMP_FORCE
    }

    // 월드 밖으로 떨어지면 시작 지점으로 되돌린다
    if (position.y + FALL_LIMIT < worldMinY) {
      position.copy(initialPosition)
      velocity.set(0, 0, 0)
    }
    character.position.copy(position)
  }

  /** 원본 controls — 게임패드 0번의 왼쪽 스틱을 이동에, A 버튼을 점프에 더한다 */
  function readGamepad(): Gamepad | null {
    try {
      return navigator.getGamepads?.()[0] ?? null
    } catch {
      return null
    }
  }

  const state: ThirdPerson = {
    velocityHorizontal: 0,
    moving: false,
    airborne: false,
    bored: false,
    target: lookPoint,
    touch,

    startIntro() {
      introStartMs = performance.now()
      // 원본처럼 줌아웃 위치로 곧장 세운 뒤 당겨온다
      radius = radiusTarget = CAMERA_DISTANCE + INTRO_ZOOM
    },

    setEnabled(value: boolean) {
      enabled = value
      // 끌 때 눌려 있던 키·드래그를 푼다 — 캐릭터는 관성으로 미끄러져 선다
      if (!value) endInteraction()
    },

    snap(x: number, z: number) {
      const target = bvh.closestPointToPoint(new THREE.Vector3(x, position.y, z))?.point ?? new THREE.Vector3(x, position.y, z)
      lookTarget.add(target.clone().sub(position))
      position.copy(target)
      velocity.set(0, 0, 0)
      character.position.copy(position)
    },

    update(dt: number) {
      const nowMs = performance.now()
      if (clockBaseMs < 0) clockBaseMs = nowMs
      const clock = (nowMs - clockBaseMs) / 1000
      const introSec = introStartMs >= 0 ? (nowMs - introStartMs) / 1000 : -1
      // 원본 ticker.ratio — 60fps 한 프레임을 1로 둔 프레임 길이(최대 5프레임분)
      const ratio = Math.min(5, dt * 60)

      updateCamera(ratio, clock, introSec)

      // 원본 controls._update — 키는 방향만 보고(정규화), 마우스 조이스틱은 세기까지
      // 더한 뒤 길이 1로 자른다. 인트로 1.5초 전에는 조작을 받지 않는다.
      let forward = 0
      let strafe = 0
      if (introSec >= CONTROLS_DELAY) {
        forward = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
        strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
        const keyLength = Math.hypot(forward, strafe)
        if (keyLength > 0) {
          forward /= keyLength
          strafe /= keyLength
        }
        forward -= drag.y
        strafe += drag.x
        const pad = enabled ? readGamepad() : null
        if (pad) {
          strafe += gamepadAxis(pad.axes[0])
          forward -= gamepadAxis(pad.axes[1])
          const button = pad.buttons[0]
          if (button?.pressed) {
            gamepadJump = true
            requestJump(true)
          } else if (gamepadJump) {
            gamepadJump = false
            requestJump(false)
          }
        }
        // 월드 방향 입력은 카메라 기준 전후·좌우로 바꿔 더한다(가속 식의 역변환)
        const world = steer?.()
        if (world) {
          forward -= Math.sin(camTheta) * world.x + Math.cos(camTheta) * world.z
          strafe += Math.cos(camTheta) * world.x - Math.sin(camTheta) * world.z
        }
        const length = Math.hypot(forward, strafe)
        if (length > 1) {
          forward /= length
          strafe /= length
        }
      } else {
        jumpRequestUntil = 0
      }
      state.moving = Math.hypot(forward, strafe) > 1e-5

      updatePhysics(ratio, clock, forward, strafe)

      // 원본 characters._update — 속도가 사실상 0인 채로 60초가 지나면 심심해한다
      if (Math.abs(velocity.x) + Math.abs(velocity.y) + Math.abs(velocity.z) < 1e-5) {
        inactiveMs += dt * 1000
        if (inactiveMs > INACTIVE_MS && !state.airborne) state.bored = true
      } else {
        inactiveMs = 0
        state.bored = false
      }
    },

    dispose() {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', endInteraction)
      document.removeEventListener('visibilitychange', onVisibility)
      domElement.removeEventListener('pointerdown', onDown)
      domElement.removeEventListener('pointermove', onMove)
      domElement.removeEventListener('pointerup', onUp)
      domElement.removeEventListener('pointercancel', onUp)
      domElement.removeEventListener('mousedown', onMouseDown)
      domElement.removeEventListener('mouseup', onMouseUp)
      domElement.removeEventListener('contextmenu', onContextMenu)
    },
  }

  return state
}
