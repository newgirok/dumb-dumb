import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    // 참고 레포(youtube-shorts-automation)의 대시보드 셸도 bg-black — 그 위에 bg-black/50
    // 사이드바를 올리는 구조라 순수하게 어둡게 보임. 우리가 bg-paper(크림)를 쓰면 반투명
    // 검정 사이드바에 크림색이 비쳐서 탁한 베이지톤으로 보여 색이 달라짐 — 동일하게 맞춤
    <div className="flex h-dvh bg-black overflow-hidden">
      <Sidebar />
      {/* Sidebar가 fixed가 아니라 일반 flex 자식(w-14)이라 별도 ms-sidebar 마진이 필요 없음 —
          예전 fixed Sidebar용으로 남아있던 마진이라 다크 사이드바 옆에 페이지 배경색이
          그대로 드러난 빈 여백으로 보이던 원인이었음 */}
      <main className="flex-1 relative pb-14 md:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
