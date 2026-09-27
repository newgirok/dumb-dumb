import { NextResponse, type NextRequest } from 'next/server'

// 인증 게이팅 없음 — 3D 씬 페이지만 공개한다.
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
