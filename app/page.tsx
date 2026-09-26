import type { Viewport } from 'next'

// 제품 진입점 — 루트(/)에서 3D 숲 씬을 바로 렌더한다.
// 씬 구현은 app/summer-afternoon/scene.tsx에 있고, 별도 URL 라우트는 두지 않는다.
export { default } from './summer-afternoon/scene'

// 원본 viewport — 노치가 있는 화면에서도 캔버스를 화면 끝까지 채운다(viewport-fit=cover)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
