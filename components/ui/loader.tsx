'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 스피너 한 바퀴(ms) — 고정된 호 하나가 이 시간에 한 바퀴 돈다. 로더는 아무리 빨리 끝나도 한 바퀴는 돌고 사라진다
 * (한 바퀴도 못 돌고 사라지면 반짝인 것처럼 보인다)
 */
export const SPIN_MS = 1000

/** 준비를 마친 로더가 다 걷히는 시간 — 글·스피너가 0.75초에 흐려지고, dissolve면 배경이 0.5초부터 0.5초에 걸쳐 녹는다 */
export const LOADER_EXIT_MS = 1000

/** 페이지 이동 로더의 배경이 화면을 다 덮는 시간 — 이동은 이만큼 기다렸다가 한다(components/layout/page-transition.tsx) */
export const LOADER_COVER_MS = 300

/**
 * 로딩 문구 한 줄을 보여 주는 간격 — 중간 줄은 실제 진행과 상관없이 이 간격으로 넘긴다. 가장 긴 줄(16자)을 한국어 자막
 * 읽기 속도(초당 12자, 넷플릭스 성인 기준)로 읽는 1.3초에, 줄이 바뀌며 흐려졌다 떠오르는 0.4초와 눈길이 가는 틈을 더했다
 */
export const LOADING_STEP_MS = 2400

/** 준비가 끝나도(내 주변은 위치를 받아도) 지금 줄은 적어도 이만큼 보인 뒤에 넘긴다 — 가장 긴 줄을 읽고 바뀌는 시간 */
const LOADING_READ_MS = 2000

/** 마지막 줄(준비 끝)을 이만큼 보여 준 뒤에 로더를 걷는다 — 떠오른 뒤 짧은 줄을 읽을 틈(자막 최소 표시 5/6초보다 길게) */
const LOADING_FINAL_MS = 1200

/** 문구가 바뀔 때 앞 줄이 빠지는 시간 — 다 빠진 뒤에 새 줄이 0.3초에 떠오른다(fade through — 두 줄이 겹쳐 보이지 않는다) */
const MESSAGE_OUT_MS = 120

/** since(performance.now())에 뜬 로더가 한 바퀴를 다 돌 때까지 기다린다 — 이미 돌았으면 바로 끝난다 */
export function waitSpinTurn(since: number): Promise<void> {
  const left = SPIN_MS - (performance.now() - since)
  return left > 0 ? new Promise((resolve) => setTimeout(resolve, left)) : Promise.resolve()
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 로딩 단계 문구 — 중간 줄은 실제 진행과 상관없이 LOADING_STEP_MS마다 같은 간격으로 넘기고(오래 걸리면 마지막 바로 앞
 * 줄에서 기다린다), 마지막 줄은 준비가 끝났다고 알릴 때(finish) 띄운다. 첫 단계만 오래 걸리고 뒤 단계가 몰아서 지나가지
 * 않고, "준비 끝" 줄은 실제로 준비됐을 때만 보인다. finish는 지금 줄을 LOADING_READ_MS는 보여 준 뒤 마지막 줄로 바꾸고
 * LOADING_FINAL_MS 뒤에 끝난다 — 그다음에 로더를 걷는다.
 * hold면 첫 줄을 go()까지 붙잡아 둔다(내 주변은 위치를 받을 때까지 첫 줄이다). 풀린 뒤에도 첫 줄을 LOADING_READ_MS는
 * 보여 준 뒤 넘긴다 — 위치가 곧바로 와도 첫 줄이 반짝 지나가지 않는다. 처음부터 다시 받을 때는 reset()
 */
export function useLoadingSteps(count: number, { hold = false }: { hold?: boolean } = {}) {
  const [shown, setShown] = useState(0)
  const [running, setRunning] = useState(!hold)
  const shownAtRef = useRef(0)
  useEffect(() => {
    shownAtRef.current = performance.now()
  }, [shown])
  useEffect(() => {
    if (!running || shown >= count - 2) return
    const wait = hold && shown === 0 ? Math.max(0, LOADING_READ_MS - (performance.now() - shownAtRef.current)) : LOADING_STEP_MS
    const timer = setTimeout(() => setShown((step) => step + 1), wait)
    return () => clearTimeout(timer)
  }, [running, shown, count, hold])

  const go = useCallback(() => setRunning(true), [])
  const reset = useCallback(() => {
    setShown(0)
    setRunning(!hold)
  }, [hold])
  const finish = useCallback(async () => {
    setRunning(false)
    const left = LOADING_READ_MS - (performance.now() - shownAtRef.current)
    if (left > 0) await sleep(left)
    setShown(count - 1)
    await sleep(LOADING_FINAL_MS)
  }, [count])
  return { shown, go, reset, finish }
}

// 스피너는 회전(transform)만 움직여 GPU 합성 스레드에서 돈다 — 로딩 중 무거운 작업이 메인 스레드를 막아도 끊기지 않는다
// (호 길이를 바꾸는 stroke-dashoffset 애니메이션은 매 프레임 메인 스레드에서 다시 그려야 해 그때마다 멈춘다).
// 준비되면 0.75s(cubic in-out)에 걸쳐 사라진다.
// 스피너는 늘 화면 한가운데에 두고 글은 그 아래로만 늘어나게 해, 로더끼리 넘겨받아도(페이지 전환 로더 → 씬 로더,
// 상태별 로더) 스피너와 첫 줄이 제자리에 있다. 글이 아래 절반에 다 들지 않는 낮은 화면(휴대폰 가로)에서만
// 스피너가 위로 비키고, 그래도 넘치면 스크롤된다 — 위아래 끝에는 16px을 남긴다(min-height라 넉넉할 때는 가운데가 그대로다).
// 움직임은 Material 3 곡선을 쓴다 — 들어올 때 강조 감속(--ld-enter), 나갈 때 강조 가속(--ld-exit), 배경은 표준(--ld-standard)
const CSS = `
  @keyframes ld-spin { to { transform: rotate(360deg); } }
  .ld-root { --ld-enter: cubic-bezier(0.05, 0.7, 0.1, 1); --ld-exit: cubic-bezier(0.3, 0, 0.8, 0.15); --ld-standard: cubic-bezier(0.2, 0, 0, 1);
    position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
    padding: 0 24px; background-color: #FFFDF8; text-align: center; overflow-y: auto; }
  .ld-root::before { content: ''; flex: 1 1 0; min-height: 16px; }
  .ld-root > * { transition: opacity 0.75s cubic-bezier(0.645, 0.045, 0.355, 1); }
  .ld-root.fading > * { opacity: 0; }
  /* dissolve — 글이 거의 흐려질 무렵 배경도 녹아 뒤의 씬이 드러난다(플레이 씬은 글이 흐려지기 시작할 때 인트로를 함께 시작해,
     같은 크림색 덮개에서 소용돌이가 열리는 장면이 드러난다).
     씬 위의 HUD(지도 버튼 등)도 장면과 함께 드러나게 그 위에 둔다 */
  .ld-root.dissolve { z-index: 30; }
  .ld-root.fading.dissolve { opacity: 0; pointer-events: none; transition: opacity 0.5s var(--ld-standard) 0.5s; }
  /* 페이지 이동 로더(늘 붙어 있다) — 나타날 때는 배경이 먼저 깔리고 스피너(92% 크기에서)·글(6px 아래에서)이 시차를 두고
     떠오른다. 걷힐 때는 글이 먼저 빠지고 배경이 녹는다. 도착한 씬 로더가 이어받으면(handoff) 스피너 박자·문구가 같은
     화면이라 그대로 걷고(cut — 걷는 동안 씬 로더 문구가 바뀌어도 겹쳐 보이지 않는다), 씬 로더에만 안내·버튼이 있으면
     한 덩어리로 0.25초에 걷는다. 다 걷힌 뒤에 스피너·글을 처음 자리(92%·6px 아래)로 돌려 둔다.
     6px은 글 줄(.ld-body의 자식)만 옮긴다 — 글 영역(.ld-body)은 로더 바닥까지 늘어나 있어 통째로 내리면 바닥을 넘쳐, 떠오르는
     0.5초 동안 로더 안에 세로 스크롤바가 생겼다 사라지며 가운데 스피너가 옆으로 튄다(두 번 뜨는 것처럼 보인다) */
  .ld-root.ld-in { transition: opacity ${LOADER_COVER_MS}ms var(--ld-standard); }
  .ld-root.ld-in > .ld-spinner { transition: opacity 0.4s var(--ld-enter) 0.1s, scale 0.5s var(--ld-enter) 0.1s; }
  .ld-root.ld-in > .ld-body { transition: opacity 0.45s var(--ld-enter) 0.16s; }
  .ld-root.ld-in > .ld-body > * { transition: translate 0.5s var(--ld-enter) 0.16s; }
  .ld-root.ld-out { opacity: 0; visibility: hidden; pointer-events: none;
    transition: opacity 0.4s var(--ld-standard) 0.15s, visibility 0s linear 0.55s; }
  .ld-root.ld-out > * { opacity: 0; transition: opacity 0.2s var(--ld-exit), scale 0s linear 0.55s; }
  .ld-root.ld-out > .ld-spinner { scale: 0.92; }
  .ld-root.ld-out > .ld-body > * { translate: 0 6px; transition: translate 0s linear 0.55s; }
  .ld-root.ld-out.handoff { transition: opacity 0.25s ease-out, visibility 0s linear 0.25s; }
  .ld-root.ld-out.handoff > * { transition: opacity 0s linear 0.25s, scale 0s linear 0.25s; }
  .ld-root.ld-out.handoff > .ld-body > * { transition: translate 0s linear 0.25s; }
  .ld-root.ld-out.handoff.cut, .ld-root.ld-out.handoff.cut > *, .ld-root.ld-out.handoff.cut > .ld-body > * { transition: none; }
  @media (prefers-reduced-motion: reduce) {
    .ld-root.ld-in > .ld-spinner, .ld-root.ld-in > .ld-body { transition: opacity 0.2s linear; }
    .ld-root.ld-out > .ld-spinner { scale: none; }
    .ld-root.ld-out > .ld-body > * { translate: none; }
  }
  .ld-root > .ld-spinner.off { visibility: hidden; }
  .ld-body { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; }
  .ld-body::after { content: ''; flex: none; height: 16px; }
  .ld-spinner { display: block; flex: none; width: 54px; height: 54px; animation: ld-spin ${SPIN_MS}ms linear infinite; will-change: transform; }
  .ld-spinner svg { display: block; width: 100%; height: 100%; }
  .ld-spinner .path { stroke: #BDBCB8; stroke-dasharray: 58 200; }
  /* 첫 줄 — 프로젝트 제목 글씨인 Stylish(지도 쪽지 제목과 같은 19px·#5d5a57), 아래 안내 줄은 Pretendard다. 로더 문구 글자만
     담은 작은 폰트(public/fonts/stylish-loader.woff2, 24KB)를 루트 레이아웃이 미리 받아 첫 로더부터 바로 그린다. 글자는 로더
     첫 줄(페이지 전환·플레이 씬·내 주변·에셋 미리보기 로더의 message)과 GPS 상태 제목에서 모은다 — 문구를 바꾸면 다시 만든다
     (공식 배포본에서 fontTools로, 라이선스 정보는 그대로 둔다. 빠진 글자는 뒤의 전체 Stylish로 그려진다):
       pyftsubset Stylish-Regular.ttf --flavor=woff2 --name-IDs='*' --output-file=public/fonts/stylish-loader.woff2
         --text=" .,!?()-+0123456789GPSkm±·…가걸게결고공관권금기길깔꺼끈나날내네는늦다대도돗동들또라락략러려렷로를리릿만맞멈면목못묶문밖받발방베변보불브비산살서세셋수시신싸써쓸씨아안았약어없에엘연열오요용우원위으을음이인임있자잠저적제져조주준줄중지직짝착창찾채책챙처추췄치터하한해했허현호화흐흔"
     문구가 바뀌면(로딩 단계 안내 등) 앞 줄이 먼저 빠지고 새 줄이 4px 아래에서 떠오른다(fade through) — 글자만 갈아 끼우면
     깜빡인 것처럼 보인다. 처음 뜬 줄은 움직이지 않는다 — 로더끼리 넘겨받을 때 같은 줄이 다시 떠오르면 깜빡여 보인다.
     'Stylish Loader'의 @font-face는 globals.css에 한 번만 둔다 — 로더마다 넣으면 붙을 때마다 폰트를 다시 맞추느라 글자가 잠깐 숨는다 */
  @keyframes ld-message-in { from { opacity: 0; translate: 0 4px; } }
  @keyframes ld-message-out { to { opacity: 0; } }
  @keyframes ld-fade-in { from { opacity: 0; } }
  /* 앞 줄과 새 줄은 한 칸에 겹친다 — 칸 폭이 긴 줄에 맞아 짧은 줄로 바뀌어도 빠지는 줄이 꺾이지 않는다 */
  .ld-line { display: grid; margin-top: 22px; }
  .ld-message { grid-area: 1 / 1; font-family: 'Stylish Loader', Stylish, Pretendard, sans-serif; font-size: 19px; line-height: 1.35; color: #5d5a57; word-break: keep-all; }
  .ld-message.in { animation: ld-message-in 0.3s var(--ld-enter) ${MESSAGE_OUT_MS}ms both; }
  .ld-message.out { animation: ld-message-out ${MESSAGE_OUT_MS}ms var(--ld-exit) both; }
  @media (prefers-reduced-motion: reduce) { .ld-message.in { animation: ld-fade-in 0.2s linear both; } }
  .ld-hint { margin-top: 6px; max-width: 24rem; font-family: Pretendard, sans-serif; font-size: 12.5px; line-height: 1.55; color: #b3aea6; word-break: keep-all; }
  .ld-detail { margin-top: 10px; max-width: 26rem; font-family: Pretendard, sans-serif; font-size: 12.5px; line-height: 1.55; color: #9a968f;
    --gps-path: #716c66; }
  .ld-actions { margin-top: 18px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
`

/** 로더의 스피너 — 작은 자리(지도 쪽지 등)에서도 같은 모양을 쓴다 */
export function LoaderSpinner({ size = 54, className = '' }: { size?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  // 새로 붙는 스피너는 먼저 떠 있던 스피너(페이지 전환 로더의 것은 늘 붙어 있다)와 같은 박자로 돈다 —
  // 로더가 바뀌어도 스피너가 처음부터 다시 돌거나 두 개가 어긋나 겹쳐 보이지 않는다
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof el.getAnimations !== 'function') return
    const lead = [...document.querySelectorAll<HTMLElement>('.ld-spinner')].find((other) => other !== el)
    const startTime = lead?.getAnimations({ subtree: true })[0]?.startTime
    if (startTime == null) return
    for (const animation of el.getAnimations({ subtree: true })) animation.startTime = startTime
  }, [])

  return (
    <span ref={ref} className={`ld-spinner ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <style>{CSS}</style>
      <svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
        <circle className="path" fill="none" strokeWidth="7" strokeLinecap="round" cx="33" cy="33" r="29" />
      </svg>
    </span>
  )
}

/**
 * 로더 — 모든 로딩(페이지 이동·플레이 씬·내 주변·에셋 미리보기)이 같은 모양을 쓴다.
 * 스피너 아래에 지금 무엇을 기다리는지 한 줄로 알린다(해요체). 기다려도 넘어가지 않는 상태(권한 거부·오류 등)는
 * spinning을 끄고 안내와 버튼(children)만 둔다(스피너 자리는 비워 둔다). 담는 요소를 꽉 채운다(position: absolute; inset: 0).
 */
export default function Loader({
  message,
  hint,
  detail,
  spinning = true,
  fading = false,
  dissolve = false,
  shown,
  handoff,
  children,
}: {
  message?: string
  hint?: string
  /** 안내 아래에 붙는 내용(설정 순서 등) */
  detail?: ReactNode
  spinning?: boolean
  /** 준비가 끝나 사라지는 중 — 내용이 0.75초에 걸쳐 흐려진다 */
  fading?: boolean
  /** 사라질 때 배경까지 녹아 뒤의 씬이 드러난다(LOADER_EXIT_MS 뒤에 걷는다) */
  dissolve?: boolean
  /** 늘 붙여 두고 띄웠다 걷는 로더(페이지 이동)만 준다 — 주지 않으면 붙어 있는 동안 늘 보인다 */
  shown?: boolean
  /** 걷힐 때 도착한 페이지의 로더가 이어받는다 — 같은 화면이면 그대로(cut), 그 로더에만 안내·버튼이 있으면 빠르게 흐려 걷는다(fade) */
  handoff?: 'cut' | 'fade'
  children?: ReactNode
}) {
  // 문구가 바뀌면 앞 줄은 잠깐 남아 빠지고 새 줄이 떠오른다. 처음 뜬 줄은 움직이지 않는다
  const [current, setCurrent] = useState(message)
  const [leaving, setLeaving] = useState<string>()
  const [changed, setChanged] = useState(false)
  if (message !== current) {
    setCurrent(message)
    setLeaving(current)
    setChanged(true)
  }
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(undefined), MESSAGE_OUT_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  const state = shown === undefined ? '' : shown ? ' ld-in' : handoff ? ` ld-out handoff${handoff === 'cut' ? ' cut' : ''}` : ' ld-out'
  return (
    <div className={`ld-root${fading ? ' fading' : ''}${dissolve ? ' dissolve' : ''}${state}`} role="status" aria-live="polite">
      <style>{CSS}</style>
      <LoaderSpinner className={spinning ? '' : 'off'} />
      <div className="ld-body">
        {(message || leaving) && (
          <div className="ld-line">
            {leaving && (
              <p key={`out-${leaving}`} className="ld-message out" aria-hidden="true">
                {leaving}
              </p>
            )}
            {message && (
              <p key={message} className={`ld-message${changed ? ' in' : ''}`}>
                {message}
              </p>
            )}
          </div>
        )}
        {hint && <p className="ld-hint">{hint}</p>}
        {detail && <div className="ld-detail">{detail}</div>}
        {children && <div className="ld-actions">{children}</div>}
      </div>
    </div>
  )
}
