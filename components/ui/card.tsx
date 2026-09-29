import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface Props extends HTMLAttributes<HTMLDivElement> {
  padding?: number
}

// 색상은 기존 값을 1:1 그대로 유지 (별도 스코프 — Button.tsx와 동일 사유)
export function Card({ padding = 24, className, style, ...props }: Props) {
  return (
    <div
      {...props}
      className={cn('bg-[#1e1e2e] rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]', className)}
      style={{ padding, ...style }}
    />
  )
}
