'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/world', label: 'WORLD', key: 'world' },
  { href: '/profile', label: 'PROFILE', key: 'profile' },
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
      className="md:hidden fixed bottom-0 left-0 right-0 flex border-t z-50"
      style={{
        borderColor: 'var(--color-border)',
        background: 'rgba(0,0,0,0.9)',
        backdropFilter: 'blur(8px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {NAV.map(({ href, label, key }) => {
        const active = pathname.startsWith('/' + key)
        return (
          <Link
            key={key}
            href={href}
            className="flex-1 flex items-center justify-center py-3.5 relative"
            style={{ borderRight: '1px solid var(--color-border)' }}
          >
            {active && (
              <span className="absolute top-0 left-0 right-0 h-px bg-white" />
            )}
            <span
              className="text-[9px] tracking-widest uppercase transition-colors"
              style={{ color: active ? '#fff' : 'rgba(255,255,255,0.25)' }}
            >
              {label}
            </span>
          </Link>
        )
      })}
      <button
        onClick={signOut}
        className="flex items-center justify-center px-5"
      >
        <span
          className="text-[9px] tracking-widest text-white/20 hover:text-white/60 transition-colors"
        >
          OUT
        </span>
      </button>
    </nav>
  )
}
