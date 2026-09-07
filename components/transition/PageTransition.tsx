'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { TossSpinner } from './TossSpinner'

// 스피너가 한 프레임 반짝이고 사라지면 오히려 더 조잡해 보여서, 아무리
// 빨리 끝나는 전환이라도 최소 이만큼은 보여줘 "전환이 있었다"는 걸 인지시킴
const MIN_VISIBLE_MS = 350

/**
 * 전체 화면 라우트 전환 오버레이 — 링크 클릭/뒤로가기 시점에 즉시 스피너를
 * 띄우고, 목적지 페이지가 커밋(그려짐)된 뒤에야 부드럽게 페이드아웃한다.
 * app/layout.tsx에서 children을 감싸 사이트 전체에 적용.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const loadingRef = useRef(false)
  const startedAtRef = useRef(0)
  const isFirstPathRef = useRef(true)

  const startLoading = () => {
    if (loadingRef.current) return
    loadingRef.current = true
    startedAtRef.current = performance.now()
    setVisible(true)
  }

  const stopLoading = () => {
    if (!loadingRef.current) return
    const elapsed = performance.now() - startedAtRef.current
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed)
    window.setTimeout(() => {
      // 새 페이지가 실제로 한 번 그려진 뒤에 사라지도록 두 프레임 대기
      requestAnimationFrame(() => requestAnimationFrame(() => {
        loadingRef.current = false
        setVisible(false)
      }))
    }, wait)
  }

  // 내부 링크 클릭 시 즉시 스피너 표시 — Next.js App Router는 라우터
  // 이벤트를 노출하지 않아서, 클릭을 직접 감지해 전환 시작 시점을 잡음
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // 캡처 단계에서 감지 — Next.js Link는 버블 단계 핸들러에서
      // preventDefault를 호출하므로, 버블 단계에서 감지하면 이미
      // defaultPrevented가 true라 모든 Link 클릭을 놓치게 됨
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname) return

      startLoading()
    }

    const onPopState = () => startLoading()

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  // pathname이 바뀌었다는 건 새 라우트의 컴포넌트 트리가 이미 커밋됐다는
  // 뜻 — 이 시점에 로딩 종료. 최초 마운트 시에는 애초에 로딩 중이 아니라
  // 아무 동작 안 함(loadingRef가 false라 stopLoading이 no-op)
  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false
      return
    }
    stopLoading()
  }, [pathname])

  return (
    <>
      {children}
      <div
        aria-hidden={!visible}
        className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-md transition-opacity duration-300 ease-out ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <TossSpinner />
      </div>
    </>
  )
}
