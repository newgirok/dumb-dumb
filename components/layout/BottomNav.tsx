'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, LocateFixed, LogOut } from 'lucide-react'
import { useStartPageLoading } from '@/components/transition/PageTransition'

// youtube-shorts-automation의 BottomNav.tsx를 그대로 포팅 — flex-1로 균등 분할되는
// 다크 글래스 하단 바 스타일까지 동일. 원본은 Home/채널설정/유튜브연결/로그아웃
// 4개였는데 우리는 대시보드/로그아웃 2개만 남김
export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const startPageLoading = useStartPageLoading()

  // 인증이 임시 비활성화된 상태라 실제 세션 종료 없이 단순히 홈으로 이동.
  // <a> 클릭이 아니라 router.push라 전환 로더 자동 감지가 안 되므로 직접 시작
  const signOut = () => {
    startPageLoading()
    router.push('/')
  }

  const recenter = () => {
    window.dispatchEvent(new Event('recenter-request'))
  }

  const active = pathname.startsWith('/dashboard')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/20 bg-black/80 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]">
      <Link
        href="/dashboard"
        className={`flex flex-1 items-center justify-center py-3 transition-colors ${
          active ? 'text-white' : 'text-white/50 hover:text-white'
        }`}
      >
        <LayoutDashboard className="h-5 w-5" />
      </Link>

      <button
        onClick={recenter}
        className="flex flex-1 items-center justify-center py-3 text-white/50 transition-colors hover:text-white"
      >
        <LocateFixed className="h-5 w-5" />
      </button>

      <button
        onClick={signOut}
        className="flex flex-1 items-center justify-center py-3 text-white/50 transition-colors hover:text-white"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </nav>
  )
}
