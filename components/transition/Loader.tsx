'use client'

import { useEffect, useState, type ReactNode } from 'react'

// 원본 로더(마을 씬) — 제목 + SVG 스피너(2.5s). 준비되면 0.75s(cubic in-out)에 걸쳐 사라진다
const CSS = `
  @keyframes ld-rotator { 0% { transform: rotate(0deg); } 100% { transform: rotate(270deg); } }
  @keyframes ld-dash {
    0% { stroke-dashoffset: 187; }
    50% { stroke-dashoffset: 46.75; transform: rotate(135deg); }
    100% { stroke-dashoffset: 187; transform: rotate(450deg); }
  }
  .ld-root { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center;
    padding: 0 24px; background-color: #FFFDF8; text-align: center; }
  .ld-root > * { transition: opacity 0.75s cubic-bezier(0.645, 0.045, 0.355, 1); }
  .ld-root.fading > * { opacity: 0; }
  .ld-root h1 { font-family: Stylish, sans-serif; font-weight: normal; font-size: 50px; line-height: 0.8em; margin: 0 0 20px 0; color: #BDBCB8; }
  .ld-root h1.fallback { line-height: 0.95em; font-size: 42px; }
  .ld-spinner { display: block; width: 54px; height: 54px; }
  .ld-spinner svg { display: block; width: 100%; height: 100%; animation: ld-rotator 2.5s linear infinite; }
  .ld-spinner .path { stroke: #BDBCB8; stroke-dasharray: 187; stroke-dashoffset: 0; transform-origin: center; animation: ld-dash 2.5s ease-in-out infinite; }
  .ld-message { margin-top: 22px; font-family: Pretendard, sans-serif; font-size: 15px; line-height: 1.5; color: #9a968f; word-break: keep-all; }
  .ld-hint { margin-top: 6px; max-width: 24rem; font-family: Pretendard, sans-serif; font-size: 12.5px; line-height: 1.55; color: #b3aea6; word-break: keep-all; }
  .ld-actions { margin-top: 18px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
`

/** 원본 로더의 스피너만 — 작은 자리(지도 쪽지 등)에서도 같은 모양을 쓴다 */
export function LoaderSpinner({ size = 54, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`ld-spinner ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <style>{CSS}</style>
      <svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
        <circle className="path" fill="none" strokeWidth="7" strokeLinecap="round" cx="33" cy="33" r="29" />
      </svg>
    </span>
  )
}

/**
 * 로더 — 모든 로딩(페이지 이동·마을 씬·내 주변·에셋 미리보기)이 같은 모양을 쓴다.
 * 제목 아래에 지금 무엇을 기다리는지 한 줄로 알린다(해요체). 기다려도 넘어가지 않는 상태(권한 거부·오류 등)는
 * spinning을 끄고 안내와 버튼(children)만 둔다. 담는 요소를 꽉 채운다(position: absolute; inset: 0).
 */
export default function Loader({
  message,
  hint,
  spinning = true,
  fading = false,
  children,
}: {
  message?: string
  hint?: string
  spinning?: boolean
  /** 준비가 끝나 사라지는 중 — 내용이 0.75초에 걸쳐 흐려진다 */
  fading?: boolean
  children?: ReactNode
}) {
  // 폰트가 늦게 오면 원본처럼 제목을 대체 크기(42px)로 둔다
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    document.fonts
      ?.load('1em Stylish')
      .then(() => !cancelled && setFontReady(true))
      .catch(() => !cancelled && setFontReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={`ld-root${fading ? ' fading' : ''}`} role="status" aria-live="polite">
      <style>{CSS}</style>
      <h1 className={fontReady ? '' : 'fallback'}>어슬렁</h1>
      {spinning && <LoaderSpinner />}
      {message && <p className="ld-message">{message}</p>}
      {hint && <p className="ld-hint">{hint}</p>}
      {children && <div className="ld-actions">{children}</div>}
    </div>
  )
}
