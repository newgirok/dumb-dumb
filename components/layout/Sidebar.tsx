'use client'

import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)

const LogOutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

interface NavButtonProps {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}

function NavButton({ icon, label, active, onClick }: NavButtonProps) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all ${
        active
          ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]'
          : 'text-white/50 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
    </button>
  )
}

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="hidden md:flex flex-col items-center justify-between w-14 py-4 bg-black/50 backdrop-blur-md border-r border-white/10 shrink-0">
      {/* 브랜드 */}
      <div className="text-xl select-none" title="오픈월드">🌍</div>

      {/* 네비게이션 */}
      <nav className="flex flex-col items-center gap-2">
        <NavButton
          icon={<HomeIcon />}
          label="월드"
          active={pathname === '/world'}
          onClick={() => router.push('/world')}
        />
        <NavButton
          icon={<UserIcon />}
          label="프로필"
          onClick={() => {}}
        />
      </nav>

      {/* 로그아웃 */}
      <NavButton icon={<LogOutIcon />} label="로그아웃" onClick={signOut} />
    </aside>
  )
}
