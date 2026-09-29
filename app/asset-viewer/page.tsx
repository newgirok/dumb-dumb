import type { Metadata } from 'next'

// 에셋 미리보기(/asset-viewer). 화면 구현은 features/asset-viewer/asset-viewer.tsx에 있다(metadata는 서버 컴포넌트에서만 내보낼 수 있다).
export { default } from '@/features/asset-viewer/asset-viewer'

export const metadata: Metadata = {
  title: '에셋 미리보기',
}
