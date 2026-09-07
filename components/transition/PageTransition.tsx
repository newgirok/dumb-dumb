'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { TossSpinner } from './TossSpinner'

// 스피너가 한 프레임 반짝이고 사라지면 오히려 더 조잡해 보여서, 아무리
// 빨리 끝나는 전환이라도 최소 이만큼은 보여줘 "전환이 있었다"는 걸 인지시킴
const MIN_VISIBLE_MS = 350

type SetReady = (ready: boolean) => void
const ReadyContext = createContext<SetReady | null>(null)

/**
 * 지도 초기화처럼 라우트 커밋 이후에도 한참 더 걸리는 무거운 페이지가
 * "나 아직 준비 안 됐다"를 알릴 수 있는 훅. false로 부르면 라우트가 바뀌어도
 * 전환 스피너가 안 꺼지고, true가 되면(또는 애초에 호출 안 하면) 라우트
 * 커밋 직후 바로 해제됨.
 */
export function useTransitionReady(ready: boolean) {
  const setReady = useContext(ReadyContext)
  useEffect(() => {
    setReady?.(ready)
  }, [setReady, ready])
}

/**
 * 전체 화면 라우트 전환 오버레이 — 링크 클릭/뒤로가기 시점에 즉시 스피너를
 * 띄우고, 목적지 페이지가 실제로 준비됐다고 알려올 때까지(useTransitionReady)
 * 기다렸다가 부드럽게 페이드아웃한다. app/layout.tsx에서 children을 감싸
 * 사이트 전체에 적용.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const loadingRef = useRef(false)
  const startedAtRef = useRef(0)
  const isFirstPathRef = useRef(true)
  const pageReadyRef = useRef(true)
  const lastPathRef = useRef(pathname)

  // 새 라우트로 렌더가 시작되면 ready 플래그를 기본값(true)으로 리셋 —
  // 이 페이지가 useTransitionReady(false)를 부르면 바로 뒤집힘. 렌더 단계에서
  // 처리해야 함: React는 effect를 자식→부모 순으로 실행하므로, 자식의
  // useTransitionReady effect가 먼저 false로 세팅한 뒤에 부모(이 컴포넌트)의
  // effect가 그걸 다시 true로 덮어써버리는 걸 막을 수 있음
  if (pathname !== lastPathRef.current) {
    lastPathRef.current = pathname
    pageReadyRef.current = true
  }

  const reveal = useCallback(() => {
    if (!loadingRef.current || !pageReadyRef.current) return
    const elapsed = performance.now() - startedAtRef.current
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed)
    window.setTimeout(() => {
      // 새 화면이 실제로 한 번 그려진 뒤에 사라지도록 두 프레임 대기
      requestAnimationFrame(() => requestAnimationFrame(() => {
        loadingRef.current = false
        setVisible(false)
      }))
    }, wait)
  }, [])

  const setReady = useCallback((ready: boolean) => {
    pageReadyRef.current = ready
    if (ready) reveal()
  }, [reveal])

  const startLoading = () => {
    if (loadingRef.current) return
    loadingRef.current = true
    startedAtRef.current = performance.now()
    setVisible(true)
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

  // pathname이 바뀌었다는 건 새 라우트의 컴포넌트 트리가 커밋됐다는 뜻 —
  // 이 시점에 reveal 시도. 아무도 useTransitionReady(false)를 안 불렀으면
  // pageReadyRef가 그대로 true라 바로 사라짐(기존 동작과 동일). 최초 마운트
  // 시에는 애초에 로딩 중이 아니라 아무 동작 안 함
  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false
      return
    }
    reveal()
  }, [pathname, reveal])

  return (
    <ReadyContext.Provider value={setReady}>
      {children}
      <div
        aria-hidden={!visible}
        className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-md transition-opacity duration-300 ease-out ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <TossSpinner />
      </div>
    </ReadyContext.Provider>
  )
}
