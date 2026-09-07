'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, LogOut } from 'lucide-react'

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  // 로그인/로그아웃 인증이 임시로 비활성화된 상태라, 실제 세션 종료 없이 단순히 홈으로 이동
  const signOut = () => {
    router.push('/')
  }

  const active = pathname.startsWith('/dashboard')

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 flex items-center justify-around h-14 bg-white border-t-2 border-grass-light shadow-[0_-2px_12px_oklch(40%_0.08_142/0.08)] pb-[env(safe-area-inset-bottom)]">
      <Link
        href="/dashboard"
        className={`flex items-center justify-center py-[0.35rem] px-4 rounded-2xl transition-all duration-200 ease-smooth ${
          active ? 'bg-grass-light text-grass-2' : 'bg-transparent text-bark-3'
        }`}
      >
        <LayoutDashboard className="w-5 h-5" />
      </Link>

      <button
        onClick={signOut}
        className="flex items-center justify-center py-[0.35rem] px-4 rounded-2xl bg-transparent border-none cursor-pointer text-bark-3 opacity-50"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </nav>
  )
}
