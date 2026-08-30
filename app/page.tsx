import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col">

      {/* ── 상단 네비게이션 ─────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/10">
        <span
          className="text-sm font-medium tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          OPENWORLD
        </span>
        <div className="flex items-center gap-8">
          <span
            className="hidden md:block text-xs text-white/35 tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            쿼터뷰 · 공간음성 · 실시간
          </span>
          <Link
            href="/login"
            className="text-xs tracking-widest uppercase border border-white/20 px-4 py-2 hover:bg-white hover:text-black transition-colors duration-200"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            입장
          </Link>
        </div>
      </nav>

      {/* ── 히어로 ─────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col justify-between px-6 md:px-12 pt-16 md:pt-24 pb-12">

        {/* 대형 타이포그래피 */}
        <div className="flex flex-col gap-0">
          <div className="overflow-hidden">
            <h1
              className="font-bold leading-none tracking-tighter text-white"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-display)',
                lineHeight: 0.88,
              }}
            >
              OPEN
            </h1>
          </div>
          <div className="overflow-hidden">
            <h1
              className="font-bold leading-none tracking-tighter"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-display)',
                lineHeight: 0.88,
                color: 'transparent',
                WebkitTextStroke: '1px rgba(255,255,255,0.4)',
              }}
            >
              WORLD
            </h1>
          </div>
        </div>

        {/* 중단 구분선 + 메타 */}
        <div className="mt-12 md:mt-16">
          <hr />
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 pt-8">

            {/* 좌측: 설명 */}
            <div className="max-w-sm">
              <p className="text-white/60 text-sm leading-relaxed">
                쿼터뷰 맵 위에서 실시간으로 이동하고,
                주변 사람들과 공간 음성으로 대화하는
                오픈월드 소셜 서비스.
              </p>
            </div>

            {/* 우측: 스펙 그리드 */}
            <div
              className="grid grid-cols-3 gap-x-8 gap-y-3 shrink-0"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {[
                ['위치', '서울, 한국'],
                ['엔진', 'Mapbox · Three.js'],
                ['음성', 'LiveKit SFU'],
                ['지도', '쿼터뷰 45°'],
                ['반경', '500m 섹터'],
                ['속도', '30km/h 상한'],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-white/30 uppercase tracking-widest">{label}</span>
                  <span className="text-xs text-white/70">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 하단: 입장 CTA */}
        <div className="mt-16 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <Link
            href="/login"
            className="group inline-flex items-center gap-4 text-sm"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <span className="w-10 h-px bg-white/30 group-hover:w-16 group-hover:bg-white transition-all duration-300" />
            <span className="text-white/50 group-hover:text-white transition-colors duration-200 tracking-widest uppercase">
              월드 입장하기
            </span>
          </Link>

          <p
            className="text-[10px] text-white/20 tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Phase 1 · Auth Active
          </p>
        </div>
      </section>

      {/* ── 하단 푸터 ───────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 px-6 md:px-12 py-4">
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] text-white/20 tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            © 2026 Openworld
          </span>
          <span
            className="text-[10px] text-white/20 tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Supabase · LiveKit · Mapbox
          </span>
        </div>
      </footer>
    </main>
  )
}
