import type { Metadata } from 'next'
import { Nunito, JetBrains_Mono } from 'next/font/google'
import { preload } from 'react-dom'
import { PageTransition } from '@/components/transition/PageTransition'
import './globals.css'

// 폰트가 오기 전에 기본 글꼴로 그렸다가 바꿔 끼우지 않도록 block으로 받는다(globals.css의 폰트도 같다)
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'block',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'block',
})

/** 한글 UI 글씨 폰트(globals.css의 Pretendard) — 모든 페이지의 로더 안내가 쓰니 여기서 먼저 받아 둔다 */
const PRETENDARD_WOFF2 = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2'

export const metadata: Metadata = {
  // 탭 제목 — 선택 페이지는 제품 이름만, 나머지는 페이지 이름을 앞에 둔다("마을 · Dumb Dumb").
  // 제품 이름은 여기 한 곳에만 쓰고, 각 페이지는 선택 페이지 버튼 이름만 title로 적는다
  title: { default: 'Dumb Dumb', template: '%s · Dumb Dumb' },
  description: '느긋하게 걷다 누군가와 마주치는 3D 오픈월드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  preload(PRETENDARD_WOFF2, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })

  return (
    <html lang="ko" className={`${nunito.variable} ${jetbrains.variable}`}>
      <body>
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  )
}
