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
    const halfW = segLen * 0.28 // 경계선 기준 양쪽으로 겹치는 크로스페이드 폭

    const setLayer = (i: number, progress: number) => {
      const boundaryIn = i * segLen // 이 씬이 등장하는 경계
      const boundaryOut = (i + 1) * segLen // 이 씬이 퇴장하는 경계

      let opacity = 1
      if (i > 0 && progress < boundaryIn + halfW) {
        opacity = Math.min(1, Math.max(0, (progress - (boundaryIn - halfW)) / (2 * halfW)))
      } else if (i < n - 1 && progress > boundaryOut - halfW) {
        opacity = Math.min(1, Math.max(0, 1 - (progress - (boundaryOut - halfW)) / (2 * halfW)))
      }

      const local = Math.min(1, Math.max(0, (progress - boundaryIn) / segLen))
      const scale = 1.18 - local * 0.18 // 활성 구간 동안 계속 줌아웃
      const y = (1 - opacity) * 16

      gsap.set(layers[i], { opacity })
      gsap.set(layers[i].querySelector('[data-scene-bg]'), { scale })
      gsap.set(layers[i].querySelector('[data-scene-text]'), { y })
    }

    // 초기 상태 렌더
    layers.forEach((_, i) => setLayer(i, 0))

    // dev 환경 Fast Refresh로 이 effect가 재실행될 때 이전 트리거가 안 정리된 채 남아
    // 서로 다른 값을 동시에 밀어붙이는 걸 방지 (예: 스크롤 위치에 따라 라운드가 이상하게 적용되는 문제)
    ScrollTrigger.getById('scene-crossfade')?.kill()
    ScrollTrigger.getById('hero-clip')?.kill()

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
        dots.forEach((dot, i) => {
          const isActive = i === activeIndex
          gsap.to(dot, {
            opacity: isActive ? 1 : 0.4,
            scale: isActive ? 1.6 : 1,
            backgroundColor: isActive ? 'var(--color-white)' : 'oklch(100% 0 0 / 0.5)',
            duration: 0.3,
            overwrite: 'auto',
          })
        })
      },
    })

    // 히어로 진입 — 토스처럼 라운드+인셋 카드가 스크롤과 함께 풀블리드로 확대.
    // margin/height(레이아웃 속성)를 매 틱 바꾸면 스크롤마다 리플로우가 발생해 걸리는 느낌이 나서,
    // 리플로우 없는 clip-path로 시각적 인셋+라운드를 표현 (레이아웃 크기는 처음부터 풀스크린 고정)
    ScrollTrigger.create({
      id: 'hero-clip',
      trigger: '[data-hero-frame]',
      start: 'top top',
      end: () => '+=' + window.innerHeight * 0.6,
      scrub: 0.5,
      onUpdate: (self) => {
        const p = self.progress
        // 소수점 px 값이 헤더의 정수 경계(64px)와 미묘하게 어긋나면 서브픽셀 이음선이 생겨서 정수로 반올림
        const top = Math.round(64 * (1 - p))
        const right = Math.round(16 * (1 - p))
        const bottom = Math.round(24 * (1 - p))
        const left = Math.round(16 * (1 - p))
        const radius = Math.round(40 * (1 - p))
        gsap.set('[data-hero-frame]', {
          clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`,
        })
      },
    })

    // 헤더 — 아래로 스크롤하면 숨고, 위로 스크롤하면 다시 나타남 (토스와 동일)
    // ScrollTrigger가 아니라 순수 scroll 이벤트로 처리 (trigger 없는 start/end 설정이 안정적으로 안 붙는 문제 회피).
    // dev StrictMode에서 effect가 두 번 실행돼도 상태가 꼬이지 않도록 DOM 자체를 공유 상태로 사용하고,
    // 매 틱의 미세한 델타가 아니라 마지막으로 판단한 지점 기준 누적 이동량으로 방향을 결정
    const onHeaderScroll = () => {
      const header = document.querySelector<HTMLElement>('[data-header]')
      if (!header) return

      const y = window.scrollY
      if (header.dataset.refY === undefined) {
        header.dataset.refY = String(y) // 최초 1회만 기준점 설정 — 매번 y로 폴백하면 누적값이 항상 0이 됨
      }
      const refY = Number(header.dataset.refY)
      const isVisible = header.dataset.visible !== 'false'

      if (y < 10) {
        header.dataset.refY = String(y)
        if (!isVisible) {
          header.dataset.visible = 'true'
          gsap.to(header, { yPercent: 0, duration: 0.3, ease: 'power2.out', overwrite: true })
        }
        return
      }

      const cumulative = y - refY
      if (Math.abs(cumulative) < 10) return // 누적 이동량이 쌓일 때까지 기준점 유지

      header.dataset.refY = String(y)
      const shouldShow = cumulative < 0
      if (shouldShow !== isVisible) {
        header.dataset.visible = String(shouldShow)
        gsap.to(header, {
          yPercent: shouldShow ? 0 : -100,
          duration: 0.3,
          ease: 'power2.out',
          overwrite: true,
        })
      }
    }
    // Fast Refresh로 effect가 재실행돼도 이전 리스너가 중복으로 남지 않도록 window에 참조 저장 후 정리
    const w = window as typeof window & { __headerScrollHandler?: () => void }
    if (w.__headerScrollHandler) {
      window.removeEventListener('scroll', w.__headerScrollHandler)
    }
    w.__headerScrollHandler = onHeaderScroll
    window.addEventListener('scroll', onHeaderScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onHeaderScroll)
      if (w.__headerScrollHandler === onHeaderScroll) {
        w.__headerScrollHandler = undefined
      }
    }
  }, { scope: rootRef })

  return (
    <main ref={rootRef} style={{ background: 'var(--color-paper)' }}>

      {/* ── HEADER ────────────────────────────────────────────── */}
      <header
        data-header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 'var(--z-sticky-nav)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px',
          padding: '0 var(--page-gutter)',
          background: 'var(--color-white)',
          boxShadow: '0 1px 0 0 var(--color-white)', // clip-path 서브픽셀 오차로 생기는 이음선 방지용 1px 오버랩
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-grass)' }} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1rem',
              color: 'oklch(20% 0.01 250)',
              letterSpacing: '-0.01em',
            }}
          >
            OPENWORLD
          </span>
        </div>

        <Link
          href="/login"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '0.85rem',
            color: 'oklch(20% 0.01 250)',
            background: 'oklch(95% 0.002 250)',
            padding: '0.5rem 1rem',
            borderRadius: '999px',
            letterSpacing: '-0.01em',
          }}
        >
          시작하기
        </Link>
      </header>

      {/* ── 좌측 스크롤 위치 내비게이션 ──────────────────────────── */}
      <nav
        aria-hidden="true"
        className="hidden md:flex"
        style={{
          position: 'fixed',
          left: '1.5rem',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 'var(--z-sticky-nav)',
          flexDirection: 'column',
          gap: '0.625rem',
        }}
      >
        {SECTIONS.map(({ id }) => (
          <span
            key={id}
            data-nav-dot={id}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'oklch(100% 0 0 / 0.5)',
              opacity: 0.4,
              transition: `all var(--dur-short) var(--ease-out)`,
            }}
          />
        ))}
      </nav>

      {/* ── 씬 스택 — 핀 고정된 화면 안에서 사진끼리 크로스페이드 ─────── */}
      <div data-scene-stack style={{ position: 'relative', height: `${SECTIONS.length * 100}svh` }}>
        <div
          data-hero-frame
          style={{
            position: 'sticky',
            top: 0,
            height: '100svh',
            clipPath: 'inset(64px 16px 24px 16px round 40px)',
          }}
        >
          {SECTIONS.map(({ id, image, eyebrow, title, desc, cta }, i) => (
            <div
              key={id}
              data-scene-layer
              data-section-id={id}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'flex-end',
                overflow: 'hidden',
                opacity: i === 0 ? 1 : 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-scene-bg
                src={image}
                alt=""
                aria-hidden="true"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, oklch(15% 0.02 250 / 0.1) 40%, oklch(10% 0.02 250 / 0.75) 100%)',
                }}
              />

              <div
                data-scene-text
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: '100%',
                  maxWidth: 'var(--page-max)',
                  margin: '0 auto',
                  padding: 'var(--space-2xl) var(--page-gutter) var(--space-3xl)',
                }}
              >
                {eyebrow && (
                  <p
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600,
                      fontSize: 'var(--text-sm)',
                      color: 'oklch(100% 0 0 / 0.75)',
                      letterSpacing: '0.02em',
                      marginBottom: '0.75rem',
                    }}
                  >
                    {eyebrow}
                  </p>
                )}
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 'clamp(2rem, 5.5vw, 4rem)',
                    lineHeight: 1.15,
                    letterSpacing: '-0.03em',
                    color: 'var(--color-white)',
                    marginBottom: '1rem',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {title}
                </h2>
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 400,
                    fontSize: 'var(--text-md)',
                    color: 'oklch(92% 0.01 142)',
                    maxWidth: '32ch',
                    lineHeight: 1.6,
                    marginBottom: cta ? '1.75rem' : 0,
                  }}
                >
                  {desc}
                </p>

                {cta && (
                  <Link
                    href="/login"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      color: 'var(--color-bark)',
                      background: 'var(--color-white)',
                      padding: '0.8rem 1.75rem',
                      borderRadius: 'var(--radius-btn)',
                      letterSpacing: '-0.01em',
                    }}
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
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: 'var(--space-3xl) var(--page-gutter) 0',
          minHeight: '90svh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/social.jpg"
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(50px) brightness(0.55) saturate(0.9)',
            transform: 'scale(1.15)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, flex: 1 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              lineHeight: 1.3,
              letterSpacing: '-0.02em',
              color: 'var(--color-white)',
              marginBottom: 'var(--space-2xl)',
            }}
          >
            이웃에서, 우정으로.
          </h2>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-3xl)',
              marginBottom: 'var(--space-2xl)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'oklch(100% 0 0 / 0.5)' }}>서비스</span>
              <Link href="/login" style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '0.875rem', color: 'oklch(100% 0 0 / 0.85)' }}>로그인</Link>
              <Link href="/world" style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '0.875rem', color: 'oklch(100% 0 0 / 0.85)' }}>월드 구경하기</Link>
            </div>
          </div>

          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'oklch(100% 0 0 / 0.4)',
              letterSpacing: '0.02em',
            }}
          >
            © 2026 Openworld
          </p>
        </div>

        <h2
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(4rem, 14vw, 11rem)',
            lineHeight: 0.85,
            letterSpacing: '-0.04em',
            color: 'oklch(100% 0 0 / 0.12)',
            margin: '0',
            whiteSpace: 'nowrap',
            transform: 'translateY(28%)',
          }}
        >
          OPENWORLD
        </h2>
      </section>
    </main>
  )
}
