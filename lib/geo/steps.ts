/**
 * 발걸음 — 휴대폰 가속도계(devicemotion)로 걸음을 센다. 내 주변이 걷는 중인지 탈것에 탔는지 GPS 속도와 함께 가릴 때 쓴다.
 * 웹에는 기기 활동 인식이 없다 — 앱이 쓰는 Android 활동 인식·iOS Core Motion도 가속도계로 걷는지부터 가린다.
 *
 * 브라우저 동작:
 * - Android 크롬은 묻지 않고 준다(사이트 설정 '동작 센서'로 막을 수 있다).
 * - iOS 사파리(13+)는 DeviceMotionEvent.requestPermission()으로 물어야 하고, 창은 탭 안에서만 띄울 수 있다.
 *   이미 답했으면 탭 밖에서 불러도 창 없이 그 답이 오고, 아직이면 탭이 필요하다며 거절한다.
 * - 센서가 없거나 막혔으면 이벤트가 오지 않거나 값이 비어 있다.
 */

/** 걸음 사이 간격(ms) — 이보다 짧으면 한 걸음 안의 흔들림, 길면 박자가 끊긴 첫걸음이다(초당 4걸음 뛰기 ~ 0.8걸음 느린 걸음) */
const STEP_MIN_MS = 250
const STEP_MAX_MS = 1250
/**
 * 가속도 크기가 바닥선(중력)보다 이만큼(m/s²) 올라가면 한 걸음 — 손에 든 휴대폰은 걸을 때 ±1.5~3 출렁이고 차 떨림은
 * 대개 ±1 안이다. 바닥선 아래로 내려와야 다음 걸음을 센다
 */
const STEP_RISE = 1
/** 가속도를 고르는 시간 상수(초) — 떨림을 걷어 내는 쪽(약 5Hz)과, 중력·자세 변화를 따라가는 바닥선(약 0.5Hz) */
const SMOOTH_S = 0.03
const BASE_S = 0.3
/** 이 안에 박자 맞는 걸음이 이만큼 있으면 걷는 중(뛰기 포함) */
const WALK_WINDOW_MS = 3000
const WALK_STEPS = 3
/** 이만큼 값이 안 오면 센서를 못 쓰는 것으로 본다 */
const SILENT_MS = 2000
/** 탭 밖에서 권한을 알아볼 때 답을 기다리는 시간과, 권한 창 답을 기다리는 시간(앱 속 브라우저가 답하지 않을 때) */
const QUERY_MS = 1000
const ASK_MS = 15_000

/** 가속도 크기(m/s²)에서 박자 맞는 걸음을 센다 — 브라우저와 떼어 둔 셈(시각은 ms) */
export function createStepCounter() {
  let last = -1
  let smooth = 0
  let base = 0
  let rising = false
  let stepAt = -Infinity
  const steps: number[] = []
  const prune = (now: number) => {
    while (steps.length && now - steps[0] > WALK_WINDOW_MS) steps.shift()
  }
  return {
    push(at: number, magnitude: number) {
      if (last < 0) {
        last = at
        smooth = base = magnitude
        return
      }
      const dt = Math.min(0.1, Math.max(0, (at - last) / 1000))
      last = at
      smooth += (magnitude - smooth) * (1 - Math.exp(-dt / SMOOTH_S))
      base += (magnitude - base) * (1 - Math.exp(-dt / BASE_S))
      const rise = smooth - base
      if (!rising && rise > STEP_RISE) {
        rising = true
        const gap = at - stepAt
        if (gap >= STEP_MIN_MS) {
          // 박자가 끊긴 첫걸음은 세지 않고 다음 걸음의 기준으로만 둔다
          if (gap <= STEP_MAX_MS) steps.push(at)
          stepAt = at
        }
      } else if (rising && rise < 0) {
        rising = false
      }
      prune(at)
    },
    /** 지난 3초에 박자 맞는 걸음이 3번 이상인가 */
    walking(now: number) {
      prune(now)
      return steps.length >= WALK_STEPS
    },
  }
}

export interface StepTracker {
  /** 지금 걷는 중인가(지난 3초에 박자 맞는 걸음 3번 이상, 뛰기 포함) */
  walking(): boolean
  /** 센서 값이 오고 있나 — 아니면 걸음으로 가릴 수 없다(센서 없음·막힘·iOS 권한 거절) */
  available(): boolean
  dispose(): void
}

/** 발걸음을 센다 — iOS는 동작 권한을 받은 뒤에 만들어야 값이 온다 */
export function createStepTracker(): StepTracker {
  const counter = createStepCounter()
  let heardAt = -Infinity
  const onMotion = ({ accelerationIncludingGravity: a }: DeviceMotionEvent) => {
    if (!a || a.x === null || a.y === null || a.z === null) return
    heardAt = performance.now()
    counter.push(heardAt, Math.hypot(a.x, a.y, a.z))
  }
  window.addEventListener('devicemotion', onMotion)
  return {
    walking: () => counter.walking(performance.now()),
    available: () => performance.now() - heardAt < SILENT_MS,
    dispose: () => window.removeEventListener('devicemotion', onMotion),
  }
}

/** 동작 권한 — 물을 필요가 없는 브라우저(Android 등)는 unneeded */
export type MotionPermission = 'granted' | 'denied' | 'prompt' | 'unneeded'

/** iOS 13+ 사파리에만 있다 — 표준 타입에 없어 따로 적는다 */
type MotionEventWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

function motionEvent(): MotionEventWithPermission | null {
  return typeof DeviceMotionEvent === 'undefined' ? null : (DeviceMotionEvent as MotionEventWithPermission)
}

const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

/** 동작 권한을 창 없이 알아본다 — iOS에서 아직 안 물었으면 prompt(탭 안에서 requestMotionPermission으로 물어야 한다) */
export async function queryMotionPermission(): Promise<MotionPermission> {
  const event = motionEvent()
  if (!event?.requestPermission) return 'unneeded'
  // 이미 답했으면 탭 밖에서도 창 없이 그 답이 온다 — 아직이면 탭이 필요하다며 거절한다
  return Promise.race([event.requestPermission().catch(() => 'prompt' as const), after(QUERY_MS, 'prompt' as const)])
}

/** 동작 권한 창을 띄운다 — 탭(클릭) 처리기 안에서 곧바로 불러야 한다 */
export function requestMotionPermission(): Promise<MotionPermission> {
  const event = motionEvent()
  if (!event?.requestPermission) return Promise.resolve('unneeded')
  return Promise.race([event.requestPermission().catch(() => 'denied' as const), after(ASK_MS, 'denied' as const)])
}
