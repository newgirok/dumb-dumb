import type { Metadata } from 'next'
import { Nunito, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '오픈월드',
  description: '쿼터뷰 오픈월드 소셜 서비스',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${nunito.variable} ${jetbrains.variable}`}>
      <head>
        {/* 랜딩 헤더에서만 사용 — 토스 실측 자간/두께에 가장 가까운 오픈소스 한국형 UI 폰트.
            사이트 전체 브랜드 폰트(Nunito)는 그대로 유지, 헤더 텍스트에만 별도 적용 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
