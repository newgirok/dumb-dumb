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
    <aside
      className="hidden md:flex flex-col items-center justify-between shrink-0"
      style={{
        width: 'var(--spacing-sidebar)',
        paddingBlock: 'var(--spacing-md)',
        background: 'var(--color-white)',
        borderRight: '2px solid var(--color-grass-light)',
        position: 'fixed',
        inset: '0 auto 0 0',
        zIndex: 'var(--z-sticky-nav)',
        boxShadow: '2px 0 12px oklch(40% 0.08 142 / 0.06)',
      }}
    >
      {/* 브랜드 아이콘 */}
      <Link
        href="/"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.25rem',
          textDecoration: 'none',
        }}
        title="홈으로"
      >
        <span style={{ fontSize: '1.75rem' }}>🌿</span>
      </Link>

      {/* 네비게이션 */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
        {SECTIONS.map(({ href, label, emoji }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
                width: '3rem',
                height: '3rem',
                borderRadius: '0.875rem',
                justifyContent: 'center',
                background: active ? 'var(--color-grass-light)' : 'transparent',
                border: active ? '2px solid var(--color-grass)' : '2px solid transparent',
                transition: `all var(--dur-short) var(--ease-smooth)`,
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{emoji}</span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '0.5rem',
                  letterSpacing: '0.04em',
                  color: active ? 'var(--color-grass-2)' : 'var(--color-bark-3)',
                  lineHeight: 1,
                }}
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
        style={{
          fontSize: '1.25rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.5rem',
          borderRadius: '0.75rem',
          opacity: 0.5,
          transition: `opacity var(--dur-short) var(--ease-smooth)`,
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '0.5')}
      >
        🚪
      </button>
    </aside>
  )
}
