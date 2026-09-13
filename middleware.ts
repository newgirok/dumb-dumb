import { NextResponse, type NextRequest } from 'next/server'

// 제품 피벗: 인증/권한 게이팅 전면 비활성화 — summer-afternoon 단독 공개.
// SaaS 완성 후 웹사이트/인증을 재도입할 때 applyAuthMiddleware 를 되살린다.
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
