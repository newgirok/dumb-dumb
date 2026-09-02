'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SECTIONS = [
  { href: '/world',   label: '월드',   emoji: '🗺️' },
  { href: '/profile', label: '프로필', emoji: '🌸' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <aside className="hidden md:flex flex-col items-center justify-between shrink-0 fixed inset-y-0 left-0 z-50 w-sidebar py-md bg-white border-r-2 border-grass-light shadow-[2px_0_12px_oklch(40%_0.08_142/0.06)]">
      {/* 브랜드 아이콘 */}
      <Link href="/" className="flex flex-col items-center gap-1" title="홈으로">
        <span className="text-[1.75rem]">🌿</span>
      </Link>

      {/* 네비게이션 */}
      <nav className="flex flex-col items-center gap-sm">
        {SECTIONS.map(({ href, label, emoji }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex flex-col items-center justify-center gap-[0.2rem] w-12 h-12 rounded-[0.875rem] border-2 transition-all duration-200 ease-smooth ${
                active ? 'bg-grass-light border-grass' : 'bg-transparent border-transparent'
              }`}
            >
              <span className="text-[1.25rem] leading-none">{emoji}</span>
              <span
                className={`font-display font-bold text-[0.5rem] tracking-[0.04em] leading-none ${
                  active ? 'text-grass-2' : 'text-bark-3'
                }`}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <button
        onClick={signOut}
        title="로그아웃"
        className="text-[1.25rem] bg-transparent border-none cursor-pointer p-2 rounded-xl opacity-50 hover:opacity-100 transition-opacity duration-200 ease-smooth"
      >
        🚪
      </button>
    </aside>
  )
}
