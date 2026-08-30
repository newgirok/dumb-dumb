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
      <body>{children}</body>
    </html>
  )
}
