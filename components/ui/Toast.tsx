'use client'

import { cn } from '@/lib/utils'

type Type = 'success' | 'error' | 'info'

interface Props {
  message: string
  type?: Type
  visible: boolean
}

// 색상은 기존 값을 1:1 그대로 유지 (별도 스코프 — Button.tsx와 동일 사유).
// 리터럴 클래스 맵으로 작성 — `bg-${x}` 문자열 보간은 Tailwind가 빌드 시점에 못 잡아서
// 프로덕션에서 클래스가 통째로 사라지므로 절대 금지
const TYPE_BG: Record<Type, string> = {
  success: 'bg-[#22c55e]',
  error: 'bg-[#ef4444]',
  info: 'bg-[#4f8ef7]',
}

export function Toast({ message, type = 'info', visible }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-6 left-1/2 -translate-x-1/2 py-3 px-6 rounded-lg text-white text-sm font-semibold',
        'transition-opacity duration-200 pointer-events-none z-[9999] whitespace-nowrap',
        TYPE_BG[type],
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {message}
    </div>
  )
}
