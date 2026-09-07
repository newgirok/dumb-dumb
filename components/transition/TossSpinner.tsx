'use client'

/** 토스 스타일 로딩 스피너 — 연한 트랙 위로 시그니처 블루 아크가 회전 */
export function TossSpinner() {
  return (
    <div
      className="w-10 h-10 rounded-full animate-spin"
      style={{
        border: '4px solid rgba(255,255,255,0.25)',
        borderTopColor: '#3182F6',
        animationDuration: '0.85s',
        animationTimingFunction: 'cubic-bezier(0.4,0,0.2,1)',
      }}
    />
  )
}
