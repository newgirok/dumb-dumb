'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, LogOut } from 'lucide-react'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  // 로그인/로그아웃 인증이 임시로 비활성화된 상태라, 실제 세션 종료 없이 단순히 홈으로 이동
  const signOut = () => {
    router.push('/')
  }

  const active = pathname.startsWith('/dashboard')

  return (
    <aside className="hidden md:flex flex-col items-center justify-between shrink-0 fixed inset-y-0 left-0 z-50 w-sidebar py-md bg-white border-r-2 border-grass-light shadow-[2px_0_12px_oklch(40%_0.08_142/0.06)]">
      {/* 브랜드 아이콘 */}
      <Link href="/" className="flex flex-col items-center gap-1" title="홈으로">
        <span className="text-[1.75rem]">🌿</span>
      </Link>

      {/* 네비게이션 — 대시보드만 남김 */}
      <nav className="flex flex-col items-center gap-sm">
        <Link
          href="/dashboard"
          title="대시보드"
          className={`flex items-center justify-center w-12 h-12 rounded-[0.875rem] border-2 transition-all duration-200 ease-smooth ${
            active ? 'bg-grass-light border-grass text-grass-2' : 'bg-transparent border-transparent text-bark-3'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
        </Link>
      </nav>

      {/* 로그아웃 */}
      <button
        onClick={signOut}
        title="로그아웃"
        className="flex items-center justify-center w-12 h-12 rounded-[0.875rem] bg-transparent border-none cursor-pointer text-bark-3 opacity-50 hover:opacity-100 transition-opacity duration-200 ease-smooth"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </aside>
  )
}
