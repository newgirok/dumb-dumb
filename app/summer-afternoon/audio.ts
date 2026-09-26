import * as THREE from 'three'

/**
 * 원본 audioController 이식.
 *
 * 브라우저 자동재생 정책상 오디오 컨텍스트는 사용자 제스처 안에서 만들어야 한다.
 * 원본처럼 첫 입력(클릭·터치·키) 순간에 리스너를 만들어 두고, 파일을 받아 모든
 * 루프를 볼륨 0으로 튼 뒤 인트로 1.5초가 지나면 전체 볼륨을 0.25까지 1초 시상수로 올린다.
 * 소리는 모두 위치와 무관한 전역 음원이다 — 숲·해변 환경음은 캐릭터 x좌표(35~65m)로
 * 서로 교차하고, 발소리는 수평 속도에 맞춰 커지며(power2.in) 루프 위상을 전역
 * 시계에 맞춰 둔다. 탭이 가려지면 조용히 줄고, 정보 모달이 열리면 배경음이 0.4배로 준다.
 */

const PATH = '/ref-assets/audio/'
/** 전체 볼륨(원본 audioController(scene, .25)) */
const MASTER_VOLUME = 0.25
/** 정보 모달이 열려 있을 때 배경음 배수와 전환 시간(원본 overlayVolume .4, 1.35s) */
const OVERLAY_VOLUME = 0.4
const OVERLAY_DURATION = 1.35
/** 발소리 루프 위상 오프셋(원본 loopOffset .125) */
const STEPS_OFFSET = 0.125
/** 파일 준비 후 소리를 내기까지 원본이 더 기다리는 시간(miscutils.wait .5) */
const START_WAIT_MS = 500

export interface SceneAudio {
  /** 매 프레임 — 캐릭터 x(숲↔해변)·수평 속도(m/프레임)·땅 위에 서 있는지로 볼륨을 맞춘다 */
  update(x: number, velocityHorizontal: number, grounded: boolean): void
  /** UI 버튼 클릭음(누르는 순간 처음부터 다시 재생) */
  click(): void
  setMuted(muted: boolean): void
  /** 정보 모달이 열렸는가 — 배경음을 0.4배로 줄인다 */
  setOverlay(open: boolean): void
  dispose(): void
}

function fit(v: number, a: number, b: number, c: number, d: number): number {
  return THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(v, Math.min(a, b), Math.max(a, b)), a, b, c, d)
}

/** gsap power2.inOut(=cubic) */
function easePower2InOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** three Audio의 재생 위치(비공개 필드) — 원본도 이 값을 직접 맞춰 루프 위상을 동기화한다 */
type SyncedAudio = THREE.Audio & { _progress: number }

/**
 * 사용자 제스처 안에서 부른다 — 리스너를 곧바로 만들고, 로딩·canPlay 대기는 뒤에서 한다.
 * canPlay가 풀리기 전의 음소거 토글은 상태만 바꾸고 소리는 내지 않는다(원본과 동일).
 */
export function createSceneAudio({
  muted: initialMuted,
  canPlay,
}: {
  muted: boolean
  canPlay: Promise<void>
}): SceneAudio {
  const listener = new THREE.AudioListener()
  listener.setMasterVolume(0)
  const ctx = listener.context
  void ctx.resume()
  const gain = listener.gain.gain

  const loops = new Map<string, THREE.Audio>()
  let clickAudio: THREE.Audio | null = null
  let loaded = false
  let disposed = false
  let muted = initialMuted
  let visible = document.visibilityState === 'visible'
  let syncOffset = 0
  // 배경음 배수 트윈(원본 gsap.to(_multiplierVolume, 1.35s))
  let overlayFrom = 1
  let overlayTo = 1
  let overlayStart = -Infinity

  const fadeTo = (value: number, timeConstant: number) => gain.setTargetAtTime(value, ctx.currentTime, timeConstant)

  const onVisibility = () => {
    const next = document.visibilityState === 'visible'
    if (next === visible) return
    visible = next
    if (!loaded) return
    if (visible) {
      if (!muted) fadeTo(MASTER_VOLUME, 2)
    } else {
      fadeTo(0, 0.5)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  ;(async () => {
    const loader = new THREE.AudioLoader().setPath(PATH)
    const load = (name: string) => loader.loadAsync(name).catch(() => null)
    const [forest, beach, steps, song, click] = await Promise.all([
      load('forest.mp3'),
      load('beach.mp3'),
      load('footsteps.mp3'),
      load('song.mp3'),
      load('click1.mp3'),
    ])
    if (disposed) return
    for (const [name, buffer] of [
      ['forest', forest],
      ['beach', beach],
      ['steps', steps],
      ['song', song],
    ] as const) {
      if (!buffer) continue
      const audio = new THREE.Audio(listener)
      audio.setBuffer(buffer)
      audio.setLoop(true)
      audio.setVolume(0)
      audio.play()
      loops.set(name, audio)
    }
    if (click) clickAudio = new THREE.Audio(listener).setBuffer(click).setLoop(false).setVolume(0.25)
    await Promise.all([canPlay, new Promise((resolve) => setTimeout(resolve, START_WAIT_MS))])
    if (disposed) return
    loaded = true
    if (visible && !muted) fadeTo(MASTER_VOLUME, 1)
  })().catch(() => {})

  const multiplier = () => {
    const t = THREE.MathUtils.clamp((performance.now() / 1000 - overlayStart) / OVERLAY_DURATION, 0, 1)
    return overlayFrom + (overlayTo - overlayFrom) * easePower2InOut(t)
  }

  return {
    update(x, velocityHorizontal, grounded) {
      if (!loaded || !visible) return
      // 발소리 루프를 전역 시계에 맞춘다 — 25ms 넘게 어긋나면 다시 맞춰 튼다
      const now = performance.now() / 1000
      const offset = now - ctx.currentTime
      const stepsAudio = loops.get('steps') as SyncedAudio | undefined
      if (stepsAudio && Math.abs(offset - syncOffset) > 0.025) {
        stepsAudio.pause()
        const duration = stepsAudio.duration || stepsAudio.buffer!.duration
        stepsAudio._progress = ((now + STEPS_OFFSET) * stepsAudio.playbackRate) % duration
        stepsAudio.play()
        syncOffset = offset
      }

      const mult = multiplier()
      loops.get('song')?.setVolume(0.5 * mult)
      const beachAmount = fit(x, 35, 65, 0, 1)
      ;(['forest', 'beach'] as const).forEach((name, i) => {
        const audio = loops.get(name)
        if (!audio) return
        const volume = i === 0 ? 1 - beachAmount : beachAmount
        audio.setVolume(volume * mult)
        if (volume === 0) {
          if (audio.isPlaying) audio.pause()
        } else if (!audio.isPlaying) {
          audio.play()
        }
      })
      const step = fit(velocityHorizontal, 0.001, 0.05, 0, 1) * (grounded ? 1 : 0)
      stepsAudio?.setVolume(step * step * step)
    },
    click() {
      if (!loaded || !clickAudio) return
      if (clickAudio.isPlaying) clickAudio.stop()
      clickAudio.play()
    },
    setMuted(next) {
      if (next === muted) return
      muted = next
      if (!loaded) return
      if (muted) fadeTo(0, 0.25)
      else if (visible) fadeTo(MASTER_VOLUME, 0.5)
    },
    setOverlay(open) {
      overlayFrom = multiplier()
      overlayTo = open ? OVERLAY_VOLUME : 1
      overlayStart = performance.now() / 1000
    },
    dispose() {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      for (const audio of loops.values()) {
        try {
          audio.stop()
        } catch {
          /* 이미 정지 */
        }
      }
      gain.setValueAtTime(0, ctx.currentTime)
    },
  }
}
