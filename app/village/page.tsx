import type { Viewport } from 'next'

// 마을 3D 씬(/village). 씬 구현은 같은 폴더의 scene.tsx에 있다.
export { default } from './scene'

// 원본 viewport — 노치가 있는 화면에서도 캔버스를 화면 끝까지 채운다(viewport-fit=cover)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
