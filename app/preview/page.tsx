import type { Metadata } from 'next'

// 에셋 미리보기(/preview). 화면 구현은 같은 폴더의 scene.tsx에 있다(metadata는 서버 컴포넌트에서만 내보낼 수 있다).
export { default } from './scene'

export const metadata: Metadata = {
  title: '에셋 미리보기',
}
