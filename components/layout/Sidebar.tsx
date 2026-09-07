'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, LocateFixed, LogOut } from 'lucide-react'

// youtube-shorts-automation의 Sidebar.tsx를 그대로 포팅 — 다크 글래스 배경, rounded-md
// 아이콘 버튼 스타일까지 동일. 원본은 Home/채널설정/유튜브연결/로그아웃 4개였는데
// 우리는 대시보드/로그아웃 2개만 남김
export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  // 인증이 임시 비활성화된 상태라 실제 세션 종료 없이 단순히 홈으로 이동
  const signOut = () => {
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
