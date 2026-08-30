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

interface NavItemProps {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}

function NavItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 py-3 gap-1 transition-colors ${
        active ? 'text-white' : 'text-white/40 hover:text-white/70'
      }`}
    >
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  )
}

export function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 flex border-t border-white/10 bg-black/80 backdrop-blur-md z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <NavItem icon={<HomeIcon />} label="월드" active={pathname === '/world'} onClick={() => router.push('/world')} />
      <NavItem icon={<UserIcon />} label="프로필" onClick={() => {}} />
      <NavItem icon={<LogOutIcon />} label="로그아웃" onClick={signOut} />
    </nav>
  )
}
