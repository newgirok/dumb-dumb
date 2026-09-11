'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, LocateFixed, LogOut, Store } from 'lucide-react'
import { useStartPageLoading } from '@/components/transition/PageTransition'
import { logout } from '@/lib/auth/session'

// youtube-shorts-automation의 Sidebar.tsx를 그대로 포팅 — 다크 글래스 배경, rounded-md
// 아이콘 버튼 스타일까지 동일. 원본은 Home/채널설정/유튜브연결/로그아웃 4개였는데
// 우리는 대시보드/로그아웃 2개만 남김
export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const startPageLoading = useStartPageLoading()

  // <a> 클릭이 아니라 router.push라 전환 로더 자동 감지가 안 되므로 직접 시작 —
  // 안 그러면 지도/랜딩 정리·로드 중 아무 피드백 없이 멈춘 것처럼 보임
  const signOut = async () => {
    startPageLoading()
    await logout()
    // 미들웨어가 리프레시 쿠키를 보고 판단하므로 서버 쪽 상태를 새로 읽어야 한다
    router.refresh()
    router.push('/')
  }

  // WorldCanvas가 직접 듣고 GPS를 재조회해 그 위치로 점프 — Sidebar는
  // 지도 내부 상태를 모르므로 커스텀 이벤트로만 요청을 던짐
  const recenter = () => {
    window.dispatchEvent(new Event('recenter-request'))
  }

  return (
    <aside className="hidden md:flex w-14 shrink-0 flex-col bg-black/50 backdrop-blur-md border-r border-white/10">
      <nav className="flex flex-1 flex-col gap-1 px-2 pt-4">
        <Link
          href="/dashboard"
          title="대시보드"
          className={`flex items-center justify-center rounded-md p-2.5 transition-colors ${
            pathname.startsWith('/dashboard')
              ? 'bg-white/20 text-white'
              : 'text-white/50 hover:bg-white/10 hover:text-white'
          }`}
        >
          <LayoutDashboard className="h-5 w-5" />
        </Link>
        <Link
          href="/store"
          title="상점"
          className={`flex items-center justify-center rounded-md p-2.5 transition-colors ${
            pathname.startsWith('/store')
              ? 'bg-white/20 text-white'
              : 'text-white/50 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Store className="h-5 w-5" />
        </Link>
      </nav>

      <div className="border-t border-white/10 p-2 flex flex-col gap-1">
        <button
          onClick={recenter}
          title="내 위치로"
          className="flex items-center justify-center rounded-md p-2.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LocateFixed className="h-5 w-5" />
        </button>
        <button
          onClick={signOut}
          title="로그아웃"
          className="flex items-center justify-center rounded-md p-2.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  )
}
