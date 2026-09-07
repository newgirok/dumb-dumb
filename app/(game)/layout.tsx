import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh bg-paper overflow-hidden">
      <Sidebar />
      {/* Sidebar가 fixed가 아니라 일반 flex 자식(w-14)이라 별도 ms-sidebar 마진이 필요 없음 —
          예전 fixed Sidebar용으로 남아있던 마진이라 다크 사이드바 옆에 페이지 배경색(크림)이
          그대로 드러난 빈 여백으로 보이던 원인이었음 */}
      <main className="flex-1 relative pb-14 md:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
