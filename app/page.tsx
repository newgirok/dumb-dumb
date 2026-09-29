import type { CSSProperties, JSX } from 'react'
import Link from 'next/link'
import { Luckiest_Guy } from 'next/font/google'
import { preload } from 'react-dom'
import { SCENE_ROUTES } from '@/lib/routes'

// 선택 페이지 — 게임 타이틀 화면처럼 여름 오후 풍경 위에서 갈 곳을 고른다.
// 색은 마을 씬(하늘·잔디·청록 나무·모래길)과 씬 HUD 버튼(크림 #f9efdc·하드 그림자 #716c66)에서 가져왔다.

// 제목 글씨 — 두툼한 만화 로고체라 장난꾸러기 같은 이름과 어울린다(Stylish는 라틴 글자가 가늘다)
const luckiestGuy = Luckiest_Guy({ subsets: ['latin'], weight: '400', variable: '--font-title', display: 'block' })

type SceneRoute = (typeof SCENE_ROUTES)[number]

/** 갈 곳마다 버튼 한 장(아이콘·이름) — 위에서 아래로 쌓고, 번갈아 살짝 기울인다 */
const PLACES: Record<SceneRoute, { title: string; badge?: string; tilt: number; Icon: () => JSX.Element }> = {
  '/village': { title: '마을', tilt: -2, Icon: VillageIcon },
  '/neighborhood': { title: '내 주변', badge: '베타', tilt: 1.5, Icon: NeighborhoodIcon },
  '/preview': { title: '에셋 미리보기', badge: '개발용', tilt: -1, Icon: PreviewIcon },
}

const CSS = `
  .home { position: relative; min-height: 100dvh; overflow: hidden; display: flex; flex-direction: column; align-items: center;
    background:
      radial-gradient(circle at 84% 10%, rgba(255, 246, 220, 0.95) 0, rgba(255, 246, 220, 0) 20%),
      linear-gradient(180deg, #71bdee 0%, #9dd5f5 36%, #d3eff7 60%, #f1faf3 76%); }
  .home-land { position: absolute; left: 0; bottom: 0; width: 100%; height: 44vh; min-height: 250px; }
  .home-cloud { position: absolute; left: 0; animation: home-drift linear infinite; will-change: transform; }
  @keyframes home-drift { from { transform: translateX(-35vw); } to { transform: translateX(125vw); } }
  /* 하한은 좁은 휴대폰(폭 320px)에서도 제목이 한 줄에 들 만큼 — 제목 폭은 글자 크기의 5배쯤이다 */
  .home-title { font-family: var(--font-title), Pretendard, sans-serif; font-weight: 400; font-size: clamp(44px, min(17vw, 22vh), 156px); line-height: 1;
    color: #fffdf8; text-shadow: 4px 4px 0 #716c66; letter-spacing: 0.02em; }
  /* 버튼 크기는 화면 폭을 따라 늘고 준다 — 가장 긴 이름(에셋 미리보기 + 배지)이 좁은 휴대폰에서도 한 줄에 든다 */
  .home-card { position: relative; display: flex; gap: clamp(12px, 3vw, 18px); align-items: center; width: min(420px, 86vw);
    padding: clamp(14px, 3.6vw, 22px) clamp(16px, 4.4vw, 28px);
    border-radius: 10px; background: #f9efdc; color: #5d5a57; box-shadow: 3px 3px 0 0 #716c66; transform: rotate(var(--tilt));
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s cubic-bezier(0.33, 1, 0.68, 1), box-shadow 0.15s cubic-bezier(0.33, 1, 0.68, 1); }
  @media (hover: hover) { .home-card:hover { transform: rotate(0deg) scale(1.04); box-shadow: 4px 4px 0 0 #716c66; } }
  .home-card:active { transform: translate(3px, 3px) rotate(0deg) scale(1.04); box-shadow: 0 0 0 0 transparent; }
  .home-card:focus-visible { outline: 3px solid #5d5a57; outline-offset: 4px; }
  .home-card svg { width: clamp(36px, 10vw, 50px); height: clamp(36px, 10vw, 50px); }
  .home-card-title { font-family: Stylish, Pretendard, sans-serif; font-size: clamp(26px, 7.2vw, 38px); line-height: 1; }
  .home-badge { font-family: Pretendard, sans-serif; font-size: 12px; line-height: 1; padding: 5px 8px; border-radius: 999px;
    background: #716c66; color: #f9efdc; vertical-align: 0.3em; margin-left: 8px; white-space: nowrap; }
  /* 제목·카드 묶음은 언덕 위 하늘의 가운데에 — 아래 여백은 언덕이 올라오는 만큼 */
  .home-hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6vh 0 max(22vh, 150px); }
  .home-places { margin-top: clamp(24px, 7vh, 72px); }
  /* 낮은 화면(휴대폰 가로) — 언덕을 낮추고 제목·카드를 줄여 세 장이 한 화면에 들어오게 한다 */
  @media (max-height: 520px) {
    .home-land { height: 38vh; min-height: 0; }
    .home-hero { padding: 3vh 0 18vh; }
    .home-title { font-size: clamp(48px, 18vh, 96px); }
    .home-places { margin-top: 3vh; gap: 10px; }
    .home-card { padding: 9px 18px; gap: 12px; }
    .home-card svg { width: 34px; height: 34px; }
    .home-card-title { font-size: 24px; }
  }
  @media (prefers-reduced-motion: reduce) { .home-cloud { animation: none; } .home-card { transition: none; } }
`

export default function Home() {
  // 버튼 이름 폰트(Stylish)는 1MB 가까이 된다 — 펼침 지도도 같은 파일을 쓰니 여기서 먼저 받아 둔다
  preload('/ref-assets/fonts/Stylish-Regular.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })

  return (
    <main className={`home ${luckiestGuy.variable}`}>
      <style>{CSS}</style>

      <Cloud className="home-cloud" style={{ top: '5vh', width: 'min(190px, 26vw)', animationDuration: '95s', animationDelay: '-30s' }} />
      <Cloud className="home-cloud" style={{ top: '48vh', width: 'min(120px, 18vw)', animationDuration: '120s', animationDelay: '-85s', opacity: 0.9 }} />
      <Cloud className="home-cloud" style={{ top: '2vh', width: 'min(140px, 20vw)', animationDuration: '140s', animationDelay: '-10s', opacity: 0.8 }} />

      <Landscape />

      <div className="relative z-10 flex w-full flex-1 flex-col items-center px-4">
        <div className="home-hero">
          <h1 className="home-title">Dumb Dumb</h1>

          <nav aria-label="갈 곳" className="home-places flex flex-col items-center gap-5">
            {SCENE_ROUTES.map((href) => {
              const place = PLACES[href]
              return (
                <Link key={href} href={href} className="home-card" style={{ ['--tilt' as string]: `${place.tilt}deg` }}>
                  <place.Icon />
                  <span className="home-card-title">
                    {place.title}
                    {place.badge && <span className="home-badge">{place.badge}</span>}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </main>
  )
}

/** 여름 오후 풍경 — 먼 언덕부터 발밑 모래길까지, 나무는 한쪽에 밝은 면을 둔 두 톤(씬의 램프 셰이딩 느낌) */
function Landscape() {
  return (
    <svg className="home-land" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path d="M0 196 C 170 150 340 152 500 178 S 850 140 1030 166 S 1310 148 1440 172 V420 H0 Z" fill="#c4e6c1" />
      <g fill="#79b397">
        <circle cx="236" cy="168" r="12" />
        <circle cx="254" cy="173" r="8" />
        <circle cx="1104" cy="158" r="11" />
        <circle cx="1120" cy="163" r="7" />
        <circle cx="1310" cy="161" r="9" />
      </g>
      <path d="M0 250 C 210 208 420 214 612 242 S 1004 214 1186 236 S 1378 226 1440 232 V420 H0 Z" fill="#a5d7a3" />
      <path d="M0 300 C 260 270 520 286 720 298 S 1180 280 1440 294 V420 H0 Z" fill="#8ecb8f" />

      {/* 모래길 — 언덕 너머에서 발밑까지 굽어 온다 */}
      <path d="M708 236 H732 C 744 292 800 352 936 420 H504 C 640 352 696 292 708 236 Z" fill="#e7cd9c" />
      <path d="M714 236 H726 C 736 292 782 352 868 420 H572 C 658 352 704 292 714 236 Z" fill="#f0dcb0" />

      {/* 덤불 */}
      <g>
        <circle cx="430" cy="322" r="19" fill="#5d9f73" />
        <circle cx="452" cy="327" r="14" fill="#5d9f73" />
        <circle cx="424" cy="315" r="10" fill="#74b387" />
        <circle cx="1000" cy="318" r="17" fill="#5d9f73" />
        <circle cx="1020" cy="322" r="12" fill="#5d9f73" />
        <circle cx="995" cy="311" r="9" fill="#74b387" />
      </g>

      <Tree x={214} y={338} r={46} />
      <Tree x={128} y={372} r={58} />
      <Tree x={1226} y={330} r={44} />
      <Tree x={1318} y={366} r={56} />

      {/* 길 위를 걸어가는 아이 — 씬 첫 장면처럼 등을 보인다 */}
      <g transform="translate(716 300) scale(0.62)">
        <ellipse cx="0" cy="30" rx="15" ry="4" fill="#6c8a5c" opacity="0.35" />
        <rect x="-5.5" y="13" width="4" height="16" rx="2" fill="#d6a27c" />
        <rect x="1.5" y="13" width="4" height="16" rx="2" fill="#d6a27c" />
        <rect x="-8" y="6" width="16" height="11" rx="4" fill="#b98aa3" />
        <rect x="-9" y="-9" width="18" height="18" rx="6" fill="#f1e8d8" />
        <circle cx="0" cy="-13" r="7" fill="#d6a27c" />
        <ellipse cx="0" cy="-15" rx="14" ry="4.5" fill="#e3c285" />
        <ellipse cx="0" cy="-18" rx="7.5" ry="5.5" fill="#ebcf95" />
        <rect x="-7.5" y="-17.5" width="15" height="2.5" fill="#c9859a" />
      </g>
    </svg>
  )
}

function Tree({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <ellipse cx={x + r * 0.2} cy={y + 4} rx={r * 0.9} ry={r * 0.18} fill="#6c8a5c" opacity="0.3" />
      <rect x={x - r * 0.14} y={y - r * 0.9} width={r * 0.28} height={r * 0.95} rx={r * 0.08} fill="#8a6a52" />
      <circle cx={x} cy={y - r * 1.35} r={r} fill="#2d6b66" />
      <circle cx={x - r * 0.28} cy={y - r * 1.62} r={r * 0.62} fill="#3d857a" />
    </g>
  )
}

function Cloud({ className, style }: { className: string; style: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 200 80" aria-hidden="true">
      <path d="M20 66 C 4 66 2 44 20 42 C 22 24 48 18 60 32 C 70 10 108 8 118 32 C 134 18 164 26 162 46 C 184 44 190 66 172 66 Z" fill="#ffe3bf" />
      <path d="M22 60 C 8 60 8 42 24 40 C 26 24 50 20 61 33 C 71 13 106 12 116 34 C 132 21 160 29 158 47 C 178 46 182 60 168 60 Z" fill="#fff7ea" />
    </svg>
  )
}

function VillageIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M7 19 L20 8 L33 19" stroke="#716c66" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 17 V31 H29 V17" fill="#f3d9c9" stroke="#716c66" strokeWidth="2.6" strokeLinejoin="round" />
      <rect x="17" y="23" width="6" height="8" rx="1" fill="#716c66" />
      <path d="M4 35 C 12 32 28 32 36 35" stroke="#7fb8c6" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

/** 에셋 상자 — 밝은 윗면·어두운 오른쪽 면의 두 톤 상자와 반짝임 */
function PreviewIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M20 7 L32 13.5 L20 20 L8 13.5 Z" fill="#fbeed3" />
      <path d="M8 13.5 L20 20 V33 L8 26.5 Z" fill="#f0d9b0" />
      <path d="M32 13.5 L20 20 V33 L32 26.5 Z" fill="#d6bb8a" />
      <path d="M20 7 L32 13.5 V26.5 L20 33 L8 26.5 V13.5 Z M8 13.5 L20 20 L32 13.5 M20 20 V33" stroke="#716c66" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M33 3 L34.2 6 L37 7 L34.2 8 L33 11 L31.8 8 L29 7 L31.8 6 Z" fill="#7fb8c6" />
    </svg>
  )
}

function NeighborhoodIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M4 30 L36 22 M10 10 L16 36 M26 6 L30 34" stroke="#d9c39a" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M20 32 C 20 32 29 22.5 29 16 C 29 11 25 7 20 7 C 15 7 11 11 11 16 C 11 22.5 20 32 20 32 Z"
        fill="#8875ad"
        stroke="#716c66"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="16" r="3.4" fill="#f9efdc" />
    </svg>
  )
}
