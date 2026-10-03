'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Loader, { LOADER_COVER_MS, SPIN_MS } from '@/components/ui/loader'

/**
 * 가는 곳마다 로딩 안내 — 씬으로 갈 때는 도착한 씬 로더의 첫 문구와 같아, 씬 로더가 넘겨받아도 글이 바뀌지 않는다.
 * 모르는 곳·코드로 이동은 기본 문구
 */
const DESTINATION_MESSAGES: Record<string, string> = {
  '/': '처음 화면으로 가는 중이에요',
  '/play': '산책 가방 챙기는 중이에요',
  '/nearby': '내 위치 찾는 중이에요',
  '/asset-viewer': '돗자리 챙기는 중이에요',
}
const DEFAULT_MESSAGE = '준비하는 중이에요'

interface TransitionCtx {
  setReady: (ready: boolean) => void
  startLoading: () => void
}
const TransitionContext = createContext<TransitionCtx | null>(null)

/**
 * 지도 초기화처럼 라우트 커밋 이후에도 한참 더 걸리는 무거운 페이지가
 * "나 아직 준비 안 됐다"를 알릴 수 있는 훅. false로 부르면 라우트가 바뀌어도
 * 전환 스피너가 안 꺼지고, true가 되면(또는 애초에 호출 안 하면) 라우트
 * 커밋 직후 바로 해제됨.
 */
export function useTransitionReady(ready: boolean) {
  const ctx = useContext(TransitionContext)
  useEffect(() => {
    ctx?.setReady(ready)
  }, [ctx, ready])
}

/**
 * router.push처럼 <a> 클릭을 거치지 않는 프로그래매틱 이동 전에 불러서
 * 로더를 띄우는 훅 — <Link>/<a> 클릭은 document 캡처 리스너가 자동으로
 * 감지하지만, 버튼의 onClick 안에서 router.push하는 경우(로그아웃 등)는
 * 감지할 방법이 없어 직접 호출이 필요함.
 */
export function useStartPageLoading() {
  const ctx = useContext(TransitionContext)
  return () => ctx?.startLoading()
}

/**
 * 전체 화면 라우트 전환 오버레이 — 링크 클릭 시점에 즉시 로더를 띄우고,
 * 로더 배경이 화면을 다 덮은 뒤에 이동한다. 목적지 페이지가 실제로 준비됐다고
 * 알려올 때까지(useTransitionReady) 기다렸다가 부드럽게 걷는다. app/layout.tsx에서
 * children을 감싸 사이트 전체에 적용.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const routerRef = useRef(router)
  const pushTimerRef = useRef(0)
  const [visible, setVisible] = useState(false)
  const [handoff, setHandoff] = useState<'cut' | 'fade'>()
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const messageRef = useRef(DEFAULT_MESSAGE)
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
    // 아무리 빨리 끝나는 전환이라도 스피너가 한 바퀴는 돌고 사라진다 — 한 바퀴도 못 돌면 반짝인 것처럼 보인다
    const elapsed = performance.now() - startedAtRef.current
    const wait = Math.max(0, SPIN_MS - elapsed)
    window.setTimeout(() => {
      // 새 화면이 실제로 한 번 그려진 뒤에 사라지도록 두 프레임 대기
      requestAnimationFrame(() => requestAnimationFrame(() => {
        // 도착한 페이지가 제 로더를 띄웠으면(문구는 떠 있는 동안 따라갔다) 같은 화면이니 그대로 걷고, 그 로더에만 안내·버튼이
        // 있으면 빠르게 흐려 걷는다. 로더가 없거나 그 로더가 벌써 걷히는 중이면 글부터 빼고 배경을 녹인다
        const pageLoader = document.querySelector('.ld-root:not(.ld-in):not(.ld-out)')
        loadingRef.current = false
        setHandoff(
          !pageLoader || pageLoader.classList.contains('fading')
            ? undefined
            : pageLoader.querySelector('.ld-hint, .ld-detail, .ld-actions')
              ? 'fade'
              : 'cut',
        )
        setVisible(false)
      }))
    }, wait)
  }, [])

  const setReady = useCallback((ready: boolean) => {
    pageReadyRef.current = ready
    if (ready) reveal()
  }, [reveal])

  const startLoading = (destination?: string) => {
    if (loadingRef.current) return
    messageRef.current = (destination && DESTINATION_MESSAGES[destination]) || DEFAULT_MESSAGE
    setMessage(messageRef.current)
    loadingRef.current = true
    startedAtRef.current = performance.now()
    setVisible(true)
  }

  useEffect(() => {
    routerRef.current = router
  }, [router])

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

      // 링크의 이동은 잠시 막고(Link는 막힌 클릭이면 옮기지 않는다 — onClick은 그대로 불린다), 로더 배경이 화면을 다 덮은
      // 뒤에 옮긴다. 먼저 옮기면 반투명한 배경 너머로 도착한 페이지(미리 받아 둔 씬의 로더 등)가 비쳐, 스피너가 나왔다
      // 가려지고 다시 뜨는 것처럼 보인다
      e.preventDefault()
      if (loadingRef.current) return
      startLoading(url.pathname)
      const to = url.pathname + url.search + url.hash
      pushTimerRef.current = window.setTimeout(() => routerRef.current.push(to), LOADER_COVER_MS)
    }

    // 뒤로·앞으로 가기에는 전환 로더를 띄우지 않는다 — 도착한 곳은 라우터 캐시로 바로 뜨거나 제 로더를 띄우므로,
    // 떠나는 씬의 로더 위에 로더가 한 번 더 겹치지 않는다. 링크를 누른 직후라 전환 로더가 떠 있었다면 바로 걷고,
    // 아직 옮기기 전이면 옮기지 않는다
    const onPopState = () => {
      window.clearTimeout(pushTimerRef.current)
      if (!loadingRef.current) return
      loadingRef.current = false
      setHandoff(undefined)
      setVisible(false)
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  // 떠 있는 동안 도착한 페이지 로더의 문구를 따라간다(fade through) — 그 로더가 이 로더 뒤에서 다음 단계로 넘어가도,
  // 걷는 순간 두 로더가 같은 화면이라 다른 문구가 툭 드러나지 않는다
  useEffect(() => {
    if (!visible) return
    const follow = () => {
      const text = document.querySelector('.ld-root:not(.ld-in):not(.ld-out) .ld-message:not(.out)')?.textContent
      if (!text || text === messageRef.current) return
      messageRef.current = text
      setMessage(text)
    }
    const observer = new MutationObserver(follow)
    observer.observe(document.body, { subtree: true, childList: true })
    follow()
    return () => observer.disconnect()
  }, [visible])

  // pathname이 바뀌었다는 건 새 라우트의 컴포넌트 트리가 커밋됐다는 뜻 —
  // 이 시점에 reveal 시도. 아무도 useTransitionReady(false)를 안 불렀으면
  // pageReadyRef가 그대로 true라 바로 사라짐(기존 동작과 동일)
  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false
      // 새로고침(하드 리로드)처럼 링크 클릭 없이 처음부터 이
      // 페이지로 들어온 경우 — 자식(useTransitionReady)이 effect 실행
      // 순서상 이미 pageReadyRef를 false로 세팅해뒀을 수 있음. 그 경우엔
      // startLoading 없이도 로더를 바로 띄워야 새로고침 시에도 보임
      if (!pageReadyRef.current) {
        loadingRef.current = true
        startedAtRef.current = performance.now()
        setVisible(true)
      }
      return
    }
    reveal()
  }, [pathname, reveal])

  return (
    <TransitionContext.Provider value={{ setReady, startLoading }}>
      {children}
      {/* 씬 로딩 화면과 같은 로더 — 도착한 씬이 제 로더를 띄우면 같은 화면이 이어진다. 나타나고 걷히는 움직임은 로더가 맡는다 */}
      <div aria-hidden={!visible} className={`fixed inset-0 z-[9999] ${visible ? '' : 'pointer-events-none'}`}>
        <Loader message={message} shown={visible} handoff={handoff} />
      </div>
    </TransitionContext.Provider>
  )
}
