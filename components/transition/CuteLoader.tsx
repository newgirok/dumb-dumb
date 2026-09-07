'use client'

/** 페이지 전환 중 통통 뛰며 기다리는 귀여운 블롭 마스코트 — 게임 캐릭터와 같은 블루 톤 */
export function CuteLoader() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="animate-cute-bounce">
        <svg width="76" height="76" viewBox="0 0 72 72" fill="none">
          {/* 몸통 */}
          <ellipse cx="36" cy="40" rx="26" ry="24" fill="#4f8ef7" />
          {/* 볼 홍조 */}
          <ellipse cx="16" cy="42" rx="6" ry="4" fill="#ff9eb0" opacity="0.6" />
          <ellipse cx="56" cy="42" rx="6" ry="4" fill="#ff9eb0" opacity="0.6" />
          {/* 눈 */}
          <circle cx="24" cy="34" r="5.5" fill="white" />
          <circle cx="48" cy="34" r="5.5" fill="white" />
          <circle cx="25" cy="35" r="2.6" fill="#1c1f25" />
          <circle cx="49" cy="35" r="2.6" fill="#1c1f25" />
          {/* 입 */}
          <path d="M30 48 Q36 53 42 48" stroke="#1c1f25" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </svg>
      </div>
      <div className="w-11 h-2.5 rounded-full bg-black/50 animate-cute-shadow" />
      <p className="text-white/70 text-sm">조금만 기다려 주세요</p>
    </div>
  )
}
