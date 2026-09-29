'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * 스피너 한 바퀴(ms) — 고정된 호 하나가 이 시간에 한 바퀴 돈다. 로더는 아무리 빨리 끝나도 한 바퀴는 돌고 사라진다
 * (한 바퀴도 못 돌고 사라지면 반짝인 것처럼 보인다)
 */
export const SPIN_MS = 1000

/** since(performance.now())에 뜬 로더가 한 바퀴를 다 돌 때까지 기다린다 — 이미 돌았으면 바로 끝난다 */
export function waitSpinTurn(since: number): Promise<void> {
  const left = SPIN_MS - (performance.now() - since)
  return left > 0 ? new Promise((resolve) => setTimeout(resolve, left)) : Promise.resolve()
}

// 스피너는 회전(transform)만 움직여 GPU 합성 스레드에서 돈다 — 로딩 중 무거운 작업이 메인 스레드를 막아도 끊기지 않는다
// (호 길이를 바꾸는 stroke-dashoffset 애니메이션은 매 프레임 메인 스레드에서 다시 그려야 해 그때마다 멈춘다).
// 준비되면 0.75s(cubic in-out)에 걸쳐 사라진다.
// 스피너는 늘 화면 한가운데에 두고 글은 그 아래로만 늘어나게 해, 로더끼리 넘겨받아도(페이지 전환 로더 → 씬 로더,
// 상태별 로더) 스피너와 첫 줄이 제자리에 있다
const CSS = `
  @keyframes ld-spin { to { transform: rotate(360deg); } }
  .ld-root { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
    padding: 0 24px; background-color: #FFFDF8; text-align: center; }
  .ld-root::before { content: ''; flex: 1 1 0; }
  .ld-root > * { transition: opacity 0.75s cubic-bezier(0.645, 0.045, 0.355, 1); }
  .ld-root.fading > * { opacity: 0; }
  .ld-root > .ld-spinner.off { visibility: hidden; }
  .ld-body { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; }
  .ld-spinner { display: block; flex: none; width: 54px; height: 54px; animation: ld-spin ${SPIN_MS}ms linear infinite; will-change: transform; }
  .ld-spinner svg { display: block; width: 100%; height: 100%; }
  .ld-spinner .path { stroke: #BDBCB8; stroke-dasharray: 58 200; }
  .ld-message { margin-top: 22px; font-family: Pretendard, sans-serif; font-size: 15px; line-height: 1.5; color: #9a968f; word-break: keep-all; }
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
  children,
}: {
  message?: string
  hint?: string
  /** 안내 아래에 붙는 내용(설정 순서 등) */
  detail?: ReactNode
  spinning?: boolean
  /** 준비가 끝나 사라지는 중 — 내용이 0.75초에 걸쳐 흐려진다 */
  fading?: boolean
  children?: ReactNode
}) {
  return (
    <div className={`ld-root${fading ? ' fading' : ''}`} role="status" aria-live="polite">
      <style>{CSS}</style>
      <LoaderSpinner className={spinning ? '' : 'off'} />
      <div className="ld-body">
        {message && <p className="ld-message">{message}</p>}
        {hint && <p className="ld-hint">{hint}</p>}
        {detail && <div className="ld-detail">{detail}</div>}
        {children && <div className="ld-actions">{children}</div>}
      </div>
    </div>
  )
}
