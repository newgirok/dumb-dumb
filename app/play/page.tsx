import type { Metadata, Viewport } from 'next'

// 플레이 씬(/play). 씬 구현은 features/play/play-scene.tsx에 있다.
export { default } from '@/features/play/play-scene'

export const metadata: Metadata = {
  title: '플레이',
}

// 원본 viewport — 노치가 있는 화면에서도 캔버스를 화면 끝까지 채운다(viewport-fit=cover)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
