import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh bg-paper overflow-hidden">
      <Sidebar />
      <main className="flex-1 relative ms-sidebar pb-14 md:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
