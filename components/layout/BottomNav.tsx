'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SECTIONS = [
  { href: '/world',   label: '월드',   emoji: '🗺️' },
  { href: '/profile', label: '프로필', emoji: '🌸' },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 flex items-center justify-around h-14 bg-white border-t-2 border-grass-light shadow-[0_-2px_12px_oklch(40%_0.08_142/0.08)] pb-[env(safe-area-inset-bottom)]">
      {SECTIONS.map(({ href, label, emoji }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-[0.15rem] py-[0.35rem] px-4 rounded-2xl transition-all duration-200 ease-smooth ${
              active ? 'bg-grass-light' : 'bg-transparent'
            }`}
          >
            <span className="text-[1.25rem] leading-none">{emoji}</span>
            <span
              className={`font-display font-bold text-[0.6rem] tracking-[0.04em] ${
                active ? 'text-grass-2' : 'text-bark-3'
              }`}
            >
              {label}
            </span>
          </Link>
        )
      })}

      <button
        onClick={signOut}
        className="flex flex-col items-center gap-[0.15rem] py-[0.35rem] px-4 rounded-2xl bg-transparent border-none cursor-pointer opacity-50"
      >
        <span className="text-[1.25rem] leading-none">🚪</span>
        <span className="font-display font-bold text-[0.6rem] text-bark-3 tracking-[0.04em]">
          나가기
        </span>
      </button>
    </nav>
  )
}
