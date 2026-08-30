'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/world', label: 'WORLD', key: 'world' },
  { href: '/profile', label: 'PROFILE', key: 'profile' },
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
    <aside
      className="hidden md:flex flex-col justify-between w-[52px] border-r shrink-0"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      {/* 브랜드 */}
      <div
        className="h-[52px] flex items-center justify-center border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Link href="/" className="text-white/60 hover:text-white transition-colors">
          <span className="text-base">⊕</span>
        </Link>
      </div>

      {/* 세로 네비게이션 텍스트 */}
      <nav className="flex flex-col flex-1 gap-0">
        {NAV.map(({ href, label, key }) => {
          const active = pathname.startsWith('/' + key)
          return (
            <Link
              key={key}
              href={href}
              className="flex items-center justify-center h-[52px] relative group"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span
                className="transition-colors duration-150"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.15em',
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  transform: 'rotate(180deg)',
                  color: active ? '#fff' : 'rgba(255,255,255,0.25)',
                }}
              >
                {label}
              </span>
              {active && (
                <span
                  className="absolute left-0 top-0 bottom-0 w-px bg-white"
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <button
        onClick={signOut}
        className="h-[52px] flex items-center justify-center border-t group"
        style={{ borderColor: 'var(--color-border)' }}
        title="로그아웃"
      >
        <span
          className="text-white/20 group-hover:text-white/60 transition-colors"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em' }}
        >
          OUT
        </span>
      </button>
    </aside>
  )
}
