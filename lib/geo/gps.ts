/**
 * 브라우저 위치 추적 — 권한·오류·정확도를 상태 하나로 묶어, 씬과 지도가 watchPosition 하나를 나눠 쓴다.
 *
 * 브라우저 동작(W3C 명세, Chromium·WebKit·Gecko 구현 기준):
 * - watch의 timeout은 첫 위치에만 걸린다. 그 뒤로 신호가 멈춰도 오류가 오지 않아, 끊김은 직접 잰다.
 * - TIMEOUT·POSITION_UNAVAILABLE 뒤에도 watch는 계속 돈다. PERMISSION_DENIED만 watch를 끝낸다.
 * - http(보안 연결 아님)에서도 navigator.geolocation은 있고, 부르면 PERMISSION_DENIED가 온다.
 * - 기기·OS 위치가 꺼져 있어도 대개 PERMISSION_DENIED다 — 사이트 차단과 구별되지 않는다.
 * - Chromium은 권한 창을 기다리는 시간도 timeout에 센다. Safari는 권한 change 이벤트를 보내지 않는다.
 * - 화면이 숨겨지면 위치가 오지 않는다(돌아오면 다시 온다).
 *
 * 좌표는 React 상태에 두지 않는다(프론트엔드 컨벤션). 구독자는 바뀔 때마다 스냅샷을 받고,
 * 화면 문구는 `useGpsSnapshot`이 상태·정확도 단계가 바뀔 때만 다시 그린다.
 */

import { useEffect, useState } from 'react'

export type GpsStatus =
  /** 아직 요청하지 않았다 */
  | 'idle'
  /** 브라우저에 위치 기능이 없다 */
  | 'unsupported'
  /** https(또는 localhost)가 아니라 브라우저가 위치를 막는다 */
  | 'insecure'
  /** 권한을 묻는 창에 아직 답하지 않았다 */
  | 'prompt'
  /** 첫 위치를 찾는 중 */
  | 'searching'
  /** 위치를 얻지 못했다는 오류가 왔다(위치 없음) — watch는 계속 찾는다 */
  | 'unavailable'
  /** 권한 거부(사이트 차단 또는 기기·OS 위치 꺼짐) */
  | 'denied'
  /** ≤20m — 걷기에 딱 좋다 */
  | 'good'
  /** ≤50m — 조금 흔들리지만 걷기에 쓴다 */
  | 'fair'
  /** ≤150m — 건물 사이·실내. 캐릭터는 따라 걷지 않는다 */
  | 'weak'
  /** ≤1km — 흐릿하다(와이파이·기지국 추정) */
  | 'coarse'
  /** 1km 넘음 — 대략적인 위치(정확한 위치 꺼짐·IP 추정) */
  | 'approximate'
  /** 받다가 멈췄다(마지막 위치는 남아 있다) */
  | 'stale'

export interface GpsFix {
  lng: number
  lat: number
  /** 이 반경(m) 안에 실제 위치가 있을 가능성이 높다(명세상 95%, 안드로이드 크롬은 68%) */
  accuracy: number
  /** 위치를 잡은 시각(ms) */
  timestamp: number
}

export interface GpsSnapshot {
  status: GpsStatus
  /** 가장 최근 위치 — 끊기거나 권한이 사라져도 마지막 값을 남긴다 */
  fix: GpsFix | null
  /** 첫 위치가 늦다(8초 넘게 못 받음) — 계속 찾는 중이지만 안내를 바꾼다 */
  slow: boolean
}

/** 정확도 단계 경계(m) */
export const GOOD_M = 20
/** 이 안이어야 캐릭터가 GPS를 따라 걷는다 */
export const WALK_M = 50
export const WEAK_M = 150
export const COARSE_M = 1000

/** 첫 위치가 이만큼 안 오면 늦다고 알린다 */
const SLOW_MS = 8_000
/** 휴대폰에서 위치가 이만큼 안 오면 멈췄다고 본다(PC는 위치가 거의 안 바뀌어 재지 않는다) */
const STALE_MS = 20_000
/** 도착했을 때 이보다 오래된 위치는 버린다 */
const TOO_OLD_MS = 30_000

export function accuracyStatus(accuracy: number): 'good' | 'fair' | 'weak' | 'coarse' | 'approximate' {
  if (accuracy <= GOOD_M) return 'good'
  if (accuracy <= WALK_M) return 'fair'
  if (accuracy <= WEAK_M) return 'weak'
  if (accuracy <= COARSE_M) return 'coarse'
  return 'approximate'
}

/** 캐릭터를 걷게 하거나 옮겨도 되는 위치인가(±50m 안) */
export function isWalkableFix(fix: GpsFix | null | undefined): boolean {
  return !!fix && fix.accuracy <= WALK_M
}

/** 위치를 받을 수 없는 상태 — 기다려도 소용없다 */
export function isGpsBlocked(status: GpsStatus): boolean {
  return status === 'denied' || status === 'insecure' || status === 'unsupported'
}

export interface GpsTracker {
  readonly snapshot: GpsSnapshot
  /** 바뀔 때마다 부른다. 해제 함수를 돌려준다 */
  subscribe(listener: (snapshot: GpsSnapshot) => void): () => void
  /** 위치 요청을 시작한다 — 여러 번 불러도 한 번만 시작한다 */
  start(): void
  /** 이미 허용된 사이트면 권한 창 없이 바로 시작한다(권한을 모르면 기다린다) */
  startIfGranted(): void
  /**
   * 요청을 새로 시작한다(권한·위치 서비스를 켠 뒤). 탭 안에서 불러야 안드로이드 크롬이
   * 꺼진 기기 위치를 켜는 창을 띄울 수 있다.
   */
  retry(): void
  dispose(): void
}

export function createGpsTracker({ watchStale = false }: { watchStale?: boolean } = {}): GpsTracker {
  let snapshot: GpsSnapshot = { status: 'idle', fix: null, slow: false }
  const listeners = new Set<(snapshot: GpsSnapshot) => void>()
  let watchId: number | null = null
  let permission: PermissionStatus | null = null
  let permissionState: PermissionState | null = null
  let started = false
  let disposed = false
  let slowTimer = 0
  let staleTimer = 0

  const set = (next: Partial<GpsSnapshot>) => {
    snapshot = { ...snapshot, ...next }
    listeners.forEach((listener) => listener(snapshot))
  }

  const waiting = () => (permissionState === 'prompt' ? 'prompt' : 'searching')

  const stopWatch = () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId)
    watchId = null
    clearTimeout(slowTimer)
    clearTimeout(staleTimer)
  }

  // 휴대폰은 걷는 동안 1초 안팎으로 위치가 온다 — 한참 안 오면(화면이 보이는데도) 멈춘 것이다
  const armStale = () => {
    clearTimeout(staleTimer)
    if (!watchStale) return
    staleTimer = window.setTimeout(() => {
      if (document.visibilityState === 'visible' && snapshot.fix) set({ status: 'stale' })
      else armStale()
    }, STALE_MS)
  }

  const onPosition = (position: GeolocationPosition) => {
    const { longitude, latitude, accuracy } = position.coords
    const previous = snapshot.fix
    // 순서가 뒤바뀌었거나 너무 오래된 위치는 버린다
    if (previous && position.timestamp < previous.timestamp) return
    if (Date.now() - position.timestamp > TOO_OLD_MS) return
    clearTimeout(slowTimer)
    armStale()
    set({
      status: accuracyStatus(accuracy),
      fix: { lng: longitude, lat: latitude, accuracy, timestamp: position.timestamp },
      slow: false,
    })
  }

  const onError = (error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) {
      // 거부 뒤로는 watch가 끝난다 — 권한이 바뀌면(onPermission) 새로 시작한다
      stopWatch()
      set({ status: 'denied' })
      return
    }
    // TIMEOUT·위치 없음 뒤에도 watch는 계속 찾는다
    if (snapshot.fix) {
      set({ status: 'stale' })
      return
    }
    if (error.code === error.TIMEOUT) set({ status: waiting(), slow: true })
    else set({ status: 'unavailable', slow: true })
  }

  const watch = () => {
    stopWatch()
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      // 첫 위치에만 걸린다. 크롬은 권한 창 시간도 세니 넉넉히 둔다(늦음 안내는 slowTimer가 한다)
      timeout: 30_000,
    })
    slowTimer = window.setTimeout(() => {
      if (!snapshot.fix && !isGpsBlocked(snapshot.status)) set({ slow: true })
    }, SLOW_MS)
  }

  // 크롬·파이어폭스만 알린다(사파리는 change를 보내지 않는다 — 그때는 위치·오류로 안다)
  const onPermission = () => {
    if (disposed || !permission) return
    const previous = permissionState
    permissionState = permission.state
    if (!started) return
    if (permissionState === 'denied') {
      stopWatch()
      set({ status: 'denied' })
    } else if (permissionState === 'granted' && previous === 'denied') {
      // 주소창에서 권한을 켜고 돌아왔다
      set({ status: 'searching', slow: false })
      watch()
    } else if (permissionState === 'granted' && snapshot.status === 'prompt') {
      set({ status: 'searching' })
    }
  }

  const queryPermission = (): Promise<PermissionState | null> => {
    if (permission) return Promise.resolve(permission.state)
    if (!navigator.permissions?.query) return Promise.resolve(null)
    return navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        permission = status
        permissionState = status.state
        status.addEventListener('change', onPermission)
        return status.state
      })
      .catch(() => null)
  }

  const start = () => {
    if (started || disposed) return
    started = true
    // http면 부르기 전에 안다 — 불러도 권한 거부로만 와서 이유를 알 수 없다
    if (!window.isSecureContext) return set({ status: 'insecure' })
    if (!('geolocation' in navigator)) return set({ status: 'unsupported' })
    set({ status: 'searching', slow: false })
    void queryPermission().then((state) => {
      if (disposed || snapshot.fix) return
      if (state === 'denied') set({ status: 'denied' })
      else if (state === 'prompt' && snapshot.status === 'searching') set({ status: 'prompt' })
    })
    watch()
  }

  return {
    get snapshot() {
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start,
    startIfGranted() {
      if (started || disposed || !window.isSecureContext || !('geolocation' in navigator)) return
      void queryPermission().then((state) => {
        if (state === 'granted') start()
      })
    },
    retry() {
      if (disposed) return
      if (!started) return start()
      if (snapshot.status === 'insecure' || snapshot.status === 'unsupported') return
      set({ status: snapshot.fix ? snapshot.status : waiting(), slow: false })
      watch()
    },
    dispose() {
      disposed = true
      stopWatch()
      permission?.removeEventListener('change', onPermission)
      listeners.clear()
    },
  }
}

export interface StartWait {
  /** 시작할 위치 — 위치를 하나라도 받기 전에는 끝나지 않는다(가짜 자리로 넘어가지 않는다) */
  promise: Promise<GpsFix>
  cancel(): void
}

/**
 * 시작할 위치를 기다린다 — ±50m 안이 오면 바로 시작하고, 그보다 흐리면 첫 위치를 받고 refineMs가 지난 뒤
 * 그 사이 가장 나은 위치로 이 근처에서 시작한다.
 * 위치를 하나도 못 받는 동안(권한 창·찾는 중·거부·http)은 넘어가지 않는다 — 대기 화면이 이유와 해결 방법을 보여 준다.
 */
export function waitForStartFix(tracker: GpsTracker, { refineMs = 6_000 } = {}): StartWait {
  let best: GpsFix | null = null
  let refineTimer = 0
  let done = false
  let resolve!: (fix: GpsFix) => void
  const promise = new Promise<GpsFix>((r) => {
    resolve = r
  })
  const stop = () => {
    done = true
    clearTimeout(refineTimer)
    unsubscribe()
  }
  const finish = (fix: GpsFix | null) => {
    if (done || !fix) return
    stop()
    resolve(fix)
  }
  const check = ({ fix }: GpsSnapshot) => {
    if (done || !fix) return
    if (!best || fix.accuracy < best.accuracy) best = fix
    if (isWalkableFix(best)) return finish(best)
    if (!refineTimer) refineTimer = window.setTimeout(() => finish(best), refineMs)
  }
  const unsubscribe = tracker.subscribe(check)
  tracker.start()
  check(tracker.snapshot)
  return { promise, cancel: () => !done && stop() }
}

/** 화면 문구용 — 상태·정확도(반올림)·slow가 바뀔 때만 다시 그린다 */
export function useGpsSnapshot(tracker: GpsTracker | null): GpsSnapshot | null {
  const [view, setView] = useState<GpsSnapshot | null>(null)
  useEffect(() => {
    if (!tracker) {
      setView(null)
      return
    }
    let key = ''
    const update = (s: GpsSnapshot) => {
      const next = `${s.status}|${s.slow}|${s.fix ? roundAccuracy(s.fix.accuracy) : ''}`
      if (next === key) return
      key = next
      setView(s)
    }
    update(tracker.snapshot)
    return tracker.subscribe(update)
  }, [tracker])
  return view
}

/** 화면에 보일 정확도 — 가까울수록 잘게, 멀수록 크게 반올림한다 */
export function roundAccuracy(accuracy: number): number {
  if (accuracy < 100) return Math.max(1, Math.round(accuracy / 5) * 5)
  if (accuracy < 1000) return Math.round(accuracy / 50) * 50
  return Math.round(accuracy / 100) * 100
}

export function formatAccuracy(accuracy: number): string {
  const m = roundAccuracy(accuracy)
  return m < 1000 ? `±${m}m` : `±${(m / 1000).toFixed(m < 10_000 ? 1 : 0)}km`
}
