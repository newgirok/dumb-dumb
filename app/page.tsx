import Link from 'next/link'

const FEATURES = [
  {
    emoji: '🗺️',
    title: '오픈 월드 탐험',
    desc: '쿼터뷰 45° 맵 위에서 실시간으로 이동하며 서울 전역을 탐험하세요.',
  },
  {
    emoji: '🎙️',
    title: '공간 음성 채팅',
    desc: '반경 500m 이내 사람들과 거리 기반 공간 음성으로 자연스럽게 대화해요.',
  },
  {
    emoji: '🌸',
    title: '소셜 & 친구',
    desc: '섬 이웃을 만들고, 함께 탐험하며 오픈월드 소셜 네트워크를 키워가세요.',
  },
]

const SPECS = [
  ['엔진',   'Mapbox · Three.js'],
  ['음성',   'LiveKit SFU'],
  ['지도',   '쿼터뷰 45°'],
  ['반경',   '500m 섹터'],
  ['인프라', 'Supabase · Vercel'],
]

export default function Home() {
  return (
    <main style={{ minHeight: '100svh', background: 'var(--color-paper)', overflowX: 'hidden' }}>

      {/* ── TOP NAV ───────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-sticky-nav)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem var(--page-gutter)',
          background: 'var(--color-white)',
          borderBottom: '2px solid var(--color-grass-light)',
          boxShadow: '0 2px 16px oklch(40% 0.08 142 / 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🌿</span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.1rem',
              color: 'var(--color-grass-2)',
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
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            color: 'var(--color-white)',
            background: 'var(--color-grass)',
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--radius-btn)',
            boxShadow: 'var(--shadow-btn)',
            transition: `all var(--dur-short) var(--ease-out)`,
          }}
        >
          시작하기 🍃
        </Link>
      </header>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          background: 'linear-gradient(180deg, var(--color-sky) 0%, oklch(80% 0.09 175) 50%, var(--color-grass) 100%)',
          padding: 'var(--space-3xl) var(--page-gutter) 0',
          textAlign: 'center',
          minHeight: '560px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 'var(--space-lg)',
          paddingBottom: '80px',
        }}
      >
        {/* 배경 떠다니는 요소들 */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <span className="float" style={{ position: 'absolute', top: '12%', left: '8%',  fontSize: '2.5rem' }}>☁️</span>
          <span className="float-slow" style={{ position: 'absolute', top: '8%',  left: '30%', fontSize: '3rem',   animationDelay: '1s'   }}>☁️</span>
          <span className="float" style={{ position: 'absolute', top: '15%', right: '10%', fontSize: '2rem',   animationDelay: '2s'   }}>☁️</span>
          <span className="float-slow" style={{ position: 'absolute', top: '5%',  right: '30%', fontSize: '1.5rem', animationDelay: '0.5s' }}>⭐</span>
          <span className="float" style={{ position: 'absolute', top: '20%', left: '50%',  fontSize: '1.2rem', animationDelay: '1.5s' }}>✨</span>
        </div>

        <div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              color: 'oklch(98% 0.01 142)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '0.75rem',
              opacity: 0.9,
            }}
          >
            🏝️ 쿼터뷰 오픈월드 소셜
          </p>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'var(--text-hero)',
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
              color: 'var(--color-white)',
              textShadow: '0 4px 24px oklch(30% 0.12 142 / 0.4)',
              marginBottom: '1rem',
            }}
          >
            OPEN<br />WORLD
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
              color: 'oklch(96% 0.02 142)',
              maxWidth: '36ch',
              margin: '0 auto 2rem',
              lineHeight: 1.6,
              textShadow: '0 2px 8px oklch(30% 0.10 142 / 0.3)',
            }}
          >
            섬 이웃을 만들고, 공간 음성으로 대화하며<br />
            서울 전역을 함께 탐험하세요.
          </p>

          <Link
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1rem',
              color: 'var(--color-grass-2)',
              background: 'var(--color-white)',
              padding: '0.875rem 2rem',
              borderRadius: 'var(--radius-btn)',
              boxShadow: '0 6px 24px oklch(30% 0.12 142 / 0.30)',
              transition: `all var(--dur-short) var(--ease-out)`,
              letterSpacing: '-0.01em',
            }}
          >
            🍃 섬으로 떠나기
          </Link>
        </div>

        {/* 나무 장식들 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'flex-end',
            width: '100%',
            maxWidth: 'min(100%, 900px)',
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            lineHeight: 1,
          }}
        >
          <span className="sway" style={{ animationDelay: '0s',    display: 'inline-block' }}>🌳</span>
          <span className="sway" style={{ animationDelay: '0.8s',  display: 'inline-block' }}>🌸</span>
          <span className="sway" style={{ animationDelay: '0.3s',  display: 'inline-block', fontSize: 'clamp(3rem, 8vw, 6rem)' }}>🌴</span>
          <span className="sway" style={{ animationDelay: '1.2s',  display: 'inline-block' }}>🍄</span>
          <span className="sway" style={{ animationDelay: '0.6s',  display: 'inline-block' }}>🌺</span>
          <span className="sway" style={{ animationDelay: '1.5s',  display: 'inline-block' }}>🌻</span>
          <span className="sway" style={{ animationDelay: '0.2s',  display: 'inline-block' }}>🌲</span>
        </div>
      </section>

      {/* 웨이브 구분선 */}
      <div style={{ lineHeight: 0, background: 'var(--color-grass)', marginTop: '-1px' }}>
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '80px' }}>
          <path
            d="M0,40 C180,80 360,0 540,40 C720,80 900,0 1080,40 C1260,80 1350,20 1440,40 L1440,80 L0,80 Z"
            fill="var(--color-paper)"
          />
        </svg>
      </div>

      {/* ── FEATURES ─────────────────────────────────────────── */}
      <section style={{ padding: 'var(--space-2xl) var(--page-gutter)', maxWidth: 'var(--page-max)', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
              color: 'var(--color-bark)',
              letterSpacing: '-0.02em',
              marginBottom: '0.5rem',
            }}
          >
            무엇을 할 수 있나요? 🌱
          </h2>
          <p style={{ color: 'var(--color-bark-2)', fontSize: 'var(--text-md)' }}>
            오픈월드에서 펼쳐지는 다양한 경험
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--space-lg)',
          }}
        >
          {FEATURES.map(({ emoji, title, desc }) => (
            <div
              key={title}
              style={{
                background: 'var(--color-white)',
                border: 'var(--border-soft)',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--space-xl)',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
                transition: `transform var(--dur-short) var(--ease-out)`,
              }}
            >
              <span style={{ fontSize: '2.5rem' }}>{emoji}</span>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: '1.1rem',
                  color: 'var(--color-grass-2)',
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h3>
              <p style={{ color: 'var(--color-bark-2)', fontSize: 'var(--text-sm)', lineHeight: 1.7 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SPECS ──────────────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--color-grass-light)',
          borderTop: 'var(--border-soft)',
          borderBottom: 'var(--border-soft)',
          padding: 'var(--space-2xl) var(--page-gutter)',
        }}
      >
        <div style={{ maxWidth: 'var(--page-max)', margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(1.25rem, 3vw, 2rem)',
              color: 'var(--color-grass-2)',
              marginBottom: 'var(--space-lg)',
              letterSpacing: '-0.02em',
            }}
          >
            🛠️ 기술 스펙
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-md)',
            }}
          >
            {SPECS.map(([tag, value]) => (
              <div
                key={tag}
                style={{
                  background: 'var(--color-white)',
                  borderRadius: '1rem',
                  padding: 'var(--space-md) var(--space-lg)',
                  boxShadow: 'var(--shadow-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-bark-3)',
                  }}
                >
                  {tag}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-bark)',
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--color-sand)',
          padding: 'var(--space-3xl) var(--page-gutter)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 배경 장식 */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', bottom: '10%', left: '5%',  fontSize: '3rem', opacity: 0.4 }}>🌼</span>
          <span style={{ position: 'absolute', top: '15%',    right: '8%', fontSize: '2.5rem', opacity: 0.4 }}>🦋</span>
          <span style={{ position: 'absolute', bottom: '20%', right: '15%',fontSize: '2rem', opacity: 0.3 }}>⭐</span>
          <span style={{ position: 'absolute', top: '10%',    left: '15%', fontSize: '2rem', opacity: 0.3 }}>🌙</span>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              color: 'var(--color-bark-2)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '0.75rem',
            }}
          >
            🏝️ 지금 바로
          </p>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(1.75rem, 5vw, 3.5rem)',
              color: 'var(--color-bark)',
              letterSpacing: '-0.03em',
              marginBottom: '1rem',
              lineHeight: 1.1,
            }}
          >
            섬 생활을 시작하세요!
          </h2>
          <p
            style={{
              color: 'var(--color-bark-2)',
              fontSize: 'var(--text-md)',
              maxWidth: '40ch',
              margin: '0 auto 2rem',
              lineHeight: 1.7,
            }}
          >
            휴대폰 번호로 간편하게 가입하고<br />
            서울의 오픈월드 섬으로 떠나보세요.
          </p>

          <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/login"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '1rem',
                color: 'var(--color-white)',
                background: 'var(--color-grass)',
                padding: '0.875rem 2rem',
                borderRadius: 'var(--radius-btn)',
                boxShadow: 'var(--shadow-btn)',
                letterSpacing: '-0.01em',
                display: 'inline-block',
              }}
            >
              🍃 무료로 시작하기
            </Link>
            <Link
              href="/world"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '1rem',
                color: 'var(--color-grass-2)',
                background: 'var(--color-white)',
                padding: '0.875rem 2rem',
                borderRadius: 'var(--radius-btn)',
                border: '2px solid var(--color-grass-light)',
                boxShadow: 'var(--shadow-card)',
                letterSpacing: '-0.01em',
                display: 'inline-block',
              }}
            >
              월드 구경하기 →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer
        style={{
          background: 'var(--color-grass-2)',
          padding: 'var(--space-2xl) var(--page-gutter)',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--page-max)',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🌿</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: '1.2rem',
                color: 'var(--color-white)',
                letterSpacing: '-0.02em',
              }}
            >
              OPENWORLD
            </span>
          </div>
          <p
            style={{
              color: 'oklch(85% 0.05 142)',
              fontSize: 'var(--text-sm)',
              maxWidth: '48ch',
              lineHeight: 1.7,
            }}
          >
            쿼터뷰 오픈월드 소셜 서비스. 공간 음성, 실시간 이동, 서울 전역.
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'oklch(70% 0.05 142)',
              letterSpacing: '0.04em',
            }}
          >
            © 2026 Openworld · Supabase · LiveKit · Mapbox · Next.js
          </p>
        </div>
      </footer>
    </main>
  )
}
