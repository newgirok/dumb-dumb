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
    <nav
      className="md:hidden"
      style={{
        position: 'fixed',
        inset: 'auto 0 0 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: '3.5rem',
        background: 'var(--color-white)',
        borderTop: '2px solid var(--color-grass-light)',
        boxShadow: '0 -2px 12px oklch(40% 0.08 142 / 0.08)',
        zIndex: 'var(--z-sticky-nav)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {SECTIONS.map(({ href, label, emoji }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.15rem',
              padding: '0.35rem 1rem',
              borderRadius: '1rem',
              background: active ? 'var(--color-grass-light)' : 'transparent',
              textDecoration: 'none',
              transition: `all var(--dur-short) var(--ease-out)`,
            }}
          >
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{emoji}</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '0.6rem',
                color: active ? 'var(--color-grass-2)' : 'var(--color-bark-3)',
                letterSpacing: '0.04em',
              }}
            >
              {label}
            </span>
          </Link>
        )
      })}

      <button
        onClick={signOut}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.15rem',
          padding: '0.35rem 1rem',
          borderRadius: '1rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          opacity: 0.5,
        }}
      >
        <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>🚪</span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '0.6rem',
            color: 'var(--color-bark-3)',
            letterSpacing: '0.04em',
          }}
        >
          나가기
        </span>
      </button>
    </nav>
  )
}
