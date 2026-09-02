import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100dvh',
        background: 'var(--color-paper)',
        overflow: 'hidden',
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          position: 'relative',
          marginInlineStart: 'var(--spacing-sidebar)',
          paddingBottom: '3.5rem',
        }}
        className="md:pb-0"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
