import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  // 주소를 바꾼 페이지 — 저장해 둔 옛 링크는 새 주소로 영구 이동한다(308)
  async redirects() {
    return [
      { source: '/village', destination: '/play', permanent: true },
      { source: '/neighborhood', destination: '/nearby', permanent: true },
      { source: '/preview', destination: '/asset-viewer', permanent: true },
    ]
  },
}

export default nextConfig
