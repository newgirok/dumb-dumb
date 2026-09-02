'use client'

import Link from 'next/link'
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger)

const SECTIONS = [
  {
    id: 'hero',
    image: '/landing/hero.jpg',
    eyebrow: null,
    title: '이웃에서,\n우정으로',
    desc: '가까운 사람들과 함께 서울을 걷다.',
    cta: true,
  },
  {
    id: 'explore',
    image: '/landing/explore.jpg',
    eyebrow: '탐험',
    title: '걸을 때마다\n새로운 이웃',
    desc: '쿼터뷰 지도 위에서 실시간으로 이동하며 도시를 탐험하세요.',
    cta: false,
  },
  {
    id: 'voice',
    image: '/landing/voice.jpg',
    eyebrow: '대화',
    title: '가까이 있으면,\n자연스럽게',
    desc: '반경 500m 이내 사람들과 거리 기반 공간 음성으로 대화해요.',
    cta: false,
  },
  {
    id: 'social',
    image: '/landing/social.jpg',
    eyebrow: '관계',
    title: '이웃이\n친구가 되기까지',
    desc: '함께 탐험하고 대화하며 오픈월드 네트워크를 키워가세요.',
    cta: false,
  },
] as const

export default function Home() {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const layers = gsap.utils.toArray<HTMLElement>('[data-scene-layer]')
    const dots = gsap.utils.toArray<HTMLElement>('[data-nav-dot]')
    const n = layers.length
    const segLen = 1 / n
    const halfW = segLen * 0.28

    const setLayer = (i: number, progress: number) => {
      const boundaryIn = i * segLen
      const boundaryOut = (i + 1) * segLen

      let opacity = 1
      if (i > 0 && progress < boundaryIn + halfW) {
        opacity = Math.min(1, Math.max(0, (progress - (boundaryIn - halfW)) / (2 * halfW)))
      } else if (i < n - 1 && progress > boundaryOut - halfW) {
        opacity = Math.min(1, Math.max(0, 1 - (progress - (boundaryOut - halfW)) / (2 * halfW)))
      }

      const local = Math.min(1, Math.max(0, (progress - boundaryIn) / segLen))
      const scale = 1.18 - local * 0.18
      const y = (1 - opacity) * 16

      gsap.set(layers[i], { opacity })
      gsap.set(layers[i].querySelector('[data-scene-bg]'), { scale })
      gsap.set(layers[i].querySelector('[data-scene-text]'), { y })
    }

    layers.forEach((_, i) => setLayer(i, 0))

    ScrollTrigger.getById('scene-crossfade')?.kill()

    // activeIndex가 실제로 바뀔 때만 도트 트윈을 걸어야 함 — 안 그러면 매 스크롤 프레임마다
    // (바뀐 게 없어도) 새 트윈이 계속 재시작되면서 아래 CSS transition과 겹쳐 깜빡거림 발생
    let prevActiveIndex = -1

    ScrollTrigger.create({
      id: 'scene-crossfade',
      trigger: '[data-scene-stack]',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        const progress = self.progress
        layers.forEach((_, i) => setLayer(i, progress))

        const activeIndex = Math.min(n - 1, Math.floor(progress * n))
        if (activeIndex !== prevActiveIndex) {
          prevActiveIndex = activeIndex
          dots.forEach((dot, i) => {
            const isActive = i === activeIndex
            // 토스 실측 결과: 활성/비활성 전환 시 크기(scale)는 절대 안 바뀌고 색상만 바뀜
            // (opacity와 색상 알파를 같이 쓰면 배경 사진 색이 비쳐서 알록달록해지므로 opacity는 안 씀).
            // 색상은 반드시 rgba()로 — GSAP가 oklch(... / alpha) 같은 CSS Color 4 문법의 알파를
            // 제대로 보간하지 못해 트윈 중간에 값이 범위를 벗어나며 깜빡거리는 문제가 있었음
            gsap.to(dot, {
              backgroundColor: isActive ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.55)',
              duration: 0.3,
              overwrite: 'auto',
            })
          })
        }
      },
    })

    // 히어로 클립 — sticky 요소를 ScrollTrigger trigger로 쓰면 progress가 어긋나고
    // scrub 지연으로 새로고침/복귀 시 잘못된 clip이 노출되는 문제가 있어서 순수 scroll 이벤트로 교체.
    // clip-path로 시각적 인셋+라운드를 표현 (레이아웃 크기는 처음부터 풀스크린 고정)
    const applyHeroClip = () => {
      const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.6)))
      const top = Math.round(64 * (1 - p))
      const right = Math.round(16 * (1 - p))
      const bottom = Math.round(24 * (1 - p))
      const left = Math.round(16 * (1 - p))
      const radius = Math.round(40 * (1 - p))
      gsap.set('[data-hero-frame]', {
        clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`,
      })
    }
    applyHeroClip()
    // 브라우저 scroll 복원(history navigation)이 useLayoutEffect 이후에 일어날 수 있어 rAF로 보정
    requestAnimationFrame(applyHeroClip)

    // 헤더 — 아래로 스크롤하면 숨고, 위로 스크롤하면 다시 나타남 (토스와 동일).
    // 새로고침/뒤로가기로 스크롤이 이미 중간에 내려가 있는 상태로 열려도, 토스 실측 결과
    // 처음엔 보이는 채로 잠깐 유지되다가 짧은 지연 뒤 같은 슬라이드업 애니메이션으로 부드럽게 사라짐.
    // 스크롤 복원이 지연 타이머와 거의 동시에 별도의 scroll 이벤트를 발생시켜 두 애니메이션이
    // 서로 덮어쓰며 중간값에 멈추는 경합이 있었어서, 초기 판정이 끝날 때까지는 scroll 리스너를 걸지 않음
    let scrollListenerAttached = false
    const onHeaderScroll = () => {
      const header = document.querySelector<HTMLElement>('[data-header]')
      if (!header) return

      const y = window.scrollY
      const applyVisibility = (visible: boolean) => {
        header.dataset.visible = String(visible)
        gsap.to(header, { yPercent: visible ? 0 : -100, duration: 0.3, ease: 'power2.out', overwrite: true })
      }

      if (header.dataset.refY === undefined) {
        header.dataset.refY = String(y)
      }
      const refY = Number(header.dataset.refY)
      const isVisible = header.dataset.visible !== 'false'

      if (y < 10) {
        header.dataset.refY = String(y)
        if (!isVisible) applyVisibility(true)
        return
      }

      const cumulative = y - refY
      if (Math.abs(cumulative) < 10) return

      header.dataset.refY = String(y)
      const shouldShow = cumulative < 0
      if (shouldShow !== isVisible) applyVisibility(shouldShow)
    }
    const onHeaderScrollHandler = () => onHeaderScroll()
    const w = window as typeof window & { __heroClipHandler?: () => void; __headerScrollHandler?: () => void }
    if (w.__heroClipHandler) window.removeEventListener('scroll', w.__heroClipHandler)
    if (w.__headerScrollHandler) window.removeEventListener('scroll', w.__headerScrollHandler)
    w.__heroClipHandler = applyHeroClip
    window.addEventListener('scroll', applyHeroClip, { passive: true })

    const initialHideTimer = window.setTimeout(() => {
      const header = document.querySelector<HTMLElement>('[data-header]')
      if (header) {
        header.dataset.refY = String(window.scrollY)
        if (window.scrollY >= 10) {
          header.dataset.visible = 'false'
          gsap.to(header, { yPercent: -100, duration: 0.3, ease: 'power2.out', overwrite: true })
        }
      }
      if (!scrollListenerAttached) {
        scrollListenerAttached = true
        w.__headerScrollHandler = onHeaderScrollHandler
        window.addEventListener('scroll', onHeaderScrollHandler, { passive: true })
      }
    }, 150)

    return () => {
      window.clearTimeout(initialHideTimer)
      window.removeEventListener('scroll', applyHeroClip)
      window.removeEventListener('scroll', onHeaderScrollHandler)
      if (w.__heroClipHandler === applyHeroClip) w.__heroClipHandler = undefined
      if (w.__headerScrollHandler === onHeaderScrollHandler) w.__headerScrollHandler = undefined
    }
  }, { scope: rootRef })

  return (
    <main ref={rootRef} className="bg-white">

      {/* ── HEADER ────────────────────────────────────────────── */}
      <header
        data-header
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-between h-16 px-gutter bg-white shadow-[0_1px_0_0_var(--color-white)]"
      >
        <span className="font-display font-extrabold text-base text-[oklch(20%_0.01_250)] tracking-[-0.01em]">
          숲친구
        </span>

        <Link
          href="/login"
          className="font-display font-semibold text-[0.85rem] text-[oklch(20%_0.01_250)] bg-[oklch(95%_0.002_250)] py-2 px-4 rounded-full tracking-[-0.01em]"
        >
          시작하기
        </Link>
      </header>

      {/* ── 좌측 스크롤 위치 내비게이션 ──────────────────────────── */}
      <nav
        aria-hidden="true"
        className="hidden md:flex flex-col fixed left-6 top-1/2 -translate-y-1/2 z-50 gap-2.5"
      >
        {SECTIONS.map(({ id }) => (
          <span
            key={id}
            data-nav-dot={id}
            className="w-3.5 h-0.5"
            // background는 gsap.to가 스크롤에 따라 직접 값을 갈아끼우는 대상이라 인라인 유지.
            // opacity는 안 씀 — 엘리먼트 opacity와 색상 알파를 같이 쓰면 배경 사진 색이 비쳐서
            // 알록달록해짐, 색상 알파 하나로만 반투명을 표현.
            // CSS transition은 일부러 안 씀 — GSAP가 이미 duration/이징으로 트윈하는 같은 속성에
            // CSS transition까지 걸리면 두 애니메이션 시스템이 겹쳐서 깜빡거림이 생김
            style={{
              background: 'rgba(255,255,255,0.55)',
            }}
          />
        ))}
      </nav>

      {/* ── 씬 스택 — 핀 고정된 화면 안에서 사진끼리 크로스페이드 ─────── */}
      {/* height는 SECTIONS.length로 매번 다르게 계산되는 동적 값이라 스캐너가 못 잡음 → 인라인 유지 */}
      <div data-scene-stack className="relative" style={{ height: `${SECTIONS.length * 100}svh` }}>
        <div data-hero-frame className="sticky top-0 h-[100svh]">
          {SECTIONS.map(({ id, image, eyebrow, title, desc, cta }, i) => (
            <div
              key={id}
              data-scene-layer
              data-section-id={id}
              className="absolute inset-0 flex items-end overflow-hidden"
              // opacity는 gsap.set이 스크롤 진행도에 따라 직접 갈아끼우는 대상. 초기값(i===0만 1)은
              // prefers-reduced-motion일 때 GSAP이 아예 안 돌아서 이 인라인 값이 그대로 최종값이 됨 — 클래스화 금지
              style={{ opacity: i === 0 ? 1 : 0 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-scene-bg
                src={image}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(15%_0.02_250/0.1)_40%,oklch(10%_0.02_250/0.75)_100%)]" />

              <div
                data-scene-text
                className="relative z-[1] w-full max-w-page mx-auto pt-2xl px-gutter pb-3xl"
              >
                {eyebrow && (
                  <p className="font-display font-semibold text-sm text-[oklch(100%_0_0/0.75)] tracking-[0.02em] mb-3">
                    {eyebrow}
                  </p>
                )}
                <h2 className="font-display font-extrabold text-[clamp(2rem,5.5vw,4rem)] leading-[1.15] tracking-[-0.03em] text-white mb-4 whitespace-pre-line">
                  {title}
                </h2>
                <p
                  className={`font-display font-normal text-md text-[oklch(92%_0.01_142)] max-w-[32ch] leading-[1.6] ${cta ? 'mb-7' : 'mb-0'}`}
                >
                  {desc}
                </p>

                {cta && (
                  <Link
                    href="/login"
                    className="inline-flex items-center font-display font-bold text-[0.9rem] text-bark bg-white py-[0.8rem] px-7 rounded-btn tracking-[-0.01em]"
                  >
                    시작하기
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 엔딩 ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-3xl px-gutter min-h-[90svh] flex flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/social.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-[50px] brightness-[0.55] saturate-[0.9] scale-[1.15]"
        />

        <div className="relative z-[1] flex-1">
          <h2 className="font-display font-extrabold text-[clamp(1.5rem,3vw,2rem)] leading-[1.3] tracking-[-0.02em] text-white mb-2xl">
            이웃에서, 우정으로.
          </h2>

          <div className="flex flex-wrap gap-3xl mb-2xl">
            <div className="flex flex-col gap-2.5">
              <span className="font-display font-bold text-[0.8rem] text-[oklch(100%_0_0/0.5)]">서비스</span>
              <Link href="/login" className="font-display font-medium text-sm text-[oklch(100%_0_0/0.85)]">로그인</Link>
              <Link href="/world" className="font-display font-medium text-sm text-[oklch(100%_0_0/0.85)]">월드 구경하기</Link>
            </div>
          </div>

          <p className="font-mono text-xs text-[oklch(100%_0_0/0.4)] tracking-[0.02em]">
            © 2026 숲친구
          </p>
        </div>

        <h2
          aria-hidden="true"
          className="font-display font-black text-[clamp(4rem,14vw,11rem)] leading-[0.85] tracking-[-0.04em] text-[oklch(100%_0_0/0.12)] m-0 whitespace-nowrap translate-y-[28%]"
        >
          숲친구
        </h2>
      </section>
    </main>
  )
}
