import { type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

// 색상은 기존 값을 1:1 그대로 유지 (Tailwind 전환이 목적이지 리디자인이 아님 —
// 이 컴포넌트의 다크테마 잔재 색상이 현재 디자인 시스템과 안 맞는 건 알지만 별도 스코프)
const variants: Record<Variant, string> = {
  primary: 'bg-[#4f8ef7] text-white border-none',
  secondary: 'bg-transparent text-[#4f8ef7] border border-[#4f8ef7]',
  ghost: 'bg-transparent text-white border-none',
}

export function Button({ variant = 'primary', className, children, ...props }: Props) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg text-sm font-semibold cursor-pointer transition-opacity duration-150',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}
