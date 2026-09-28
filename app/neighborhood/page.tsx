import type { Metadata, Viewport } from 'next'
import NeighborhoodScene from './scene'

export const metadata: Metadata = {
  title: '내 주변',
}

// 루트 씬과 같은 viewport — 노치가 있는 화면에서도 캔버스를 끝까지 채운다
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function NeighborhoodPage() {
  return <NeighborhoodScene />
}
