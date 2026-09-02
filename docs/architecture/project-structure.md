# 프로젝트 구조

```
project/
├── app/                          ← Next.js App Router
│   ├── (game)/                   ← 인게임 라우트 그룹 (인증 필수)
│   │   ├── world/
│   │   │   └── page.tsx          ← 메인 오픈월드 캔버스
│   │   └── layout.tsx
│   ├── (auth)/                   ← 인증 라우트 그룹 (비인증 진입점)
│   │   ├── login/page.tsx        ← 이메일 OTP + 소셜 OAuth 로그인 (Spot 스타일 58/42 스플릿 레이아웃)
│   │   └── verify/page.tsx       ← 이메일 OTP 인증번호 입력
│   ├── auth/callback/route.ts    ← OAuth 인증 콜백 처리 (Supabase PKCE 교환)
│   ├── api/                      ← Next.js Route Handler (헬스체크 전용)
│   │   └── health/route.ts       ← 비즈니스 로직 금지, Edge Functions 사용
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  ← 랜딩 페이지 (GSAP 스크롤 크로스페이드)
│
├── components/                   ← 공유 React 컴포넌트
│   ├── hud/                      ← 인게임 HUD (방향키, 조이스틱, 채팅 입력)
│   │   ├── DirectionPad.tsx
│   │   ├── Joystick.tsx
│   │   ├── ChatInput.tsx
│   │   └── index.tsx
│   ├── layout/                   ← 인게임 레이아웃 셸
│   │   ├── Sidebar.tsx           ← PC 좌측 사이드바
│   │   └── BottomNav.tsx         ← 모바일 하단 내비게이션
│   ├── world/
│   │   └── WorldCanvas.tsx       ← Mapbox + Three.js WebGL 통합 진입점
│   ├── avatar/
│   │   └── AvatarCard.tsx        ← 아바타 선택·미리보기 카드 (Phase 6 결제 플로우 연결 예정)
│   └── ui/                       ← 공통 UI (버튼, 카드, 토스트, 스피너)
│
├── lib/                          ← 클라이언트 공유 로직
│   ├── supabase/
│   │   ├── client.ts             ← 브라우저용 Supabase 클라이언트
│   │   └── server.ts             ← 서버·미들웨어용 Supabase 클라이언트
│   ├── map/
│   │   ├── context.ts            ← WebGL Context Sharing 초기화 (단일 진입점)
│   │   ├── camera.ts             ← Camera Hijack + 카메라 잠금
│   │   └── snap.ts               ← 오솔길 스냅 알고리즘
│   ├── three/
│   │   ├── character.ts          ← GLB 로드 + Walk/Idle 애니메이션
│   │   ├── fog.ts                ← Fog of War CSS Vignette 제어
│   │   └── prune.ts              ← 반경 450m 외곽 dispose() 배치
│   ├── realtime/
│   │   ├── position.ts           ← Supabase Realtime 위치 브로드캐스트
│   │   └── chat.ts               ← 무상태 공간 채팅 라우팅
│   ├── voice/
│   │   ├── livekit.ts            ← LiveKit 룸 조인·파기
│   │   └── spatial-audio.ts      ← 볼륨 감쇠 + 3D 패닝
│   ├── geo/
│   │   ├── validator.ts          ← 클라이언트 속도 검증 (30km/h 드롭)
│   │   └── sector.ts             ← 섹터 경계 Pre-Join 로직
│   └── auth/
│       ├── session.ts            ← JWT 파싱 + 토큰 갱신 헬퍼
│       └── middleware.ts         ← 라우트 보호 미들웨어 로직
│
├── supabase/
│   ├── functions/                ← Edge Functions (각 함수: index.ts)
│   │   ├── livekit-token/        ← LiveKit 룸 토큰 발급
│   │   └── spatial-query/        ← 반경 내 스폰서 랜드마크 탐지 (ST_DWithin)
│   └── migrations/               ← DB 마이그레이션 SQL
│       ├── 0001_init.sql         ← 초기 스키마 (PostGIS, pg_cron, pgcrypto)
│       ├── 0002_characters.sql   ← characters + orders 테이블
│       ├── 0003_sponsor.sql      ← sponsor_buildings + GiST 인덱스
│       ├── 0004_impressions.sql  ← ad_impressions 테이블
│       └── 0005_spatial_query_fn.sql ← ST_DWithin 공간 쿼리 함수
│
├── public/
│   ├── illustration-login.png    ← 로그인 화면 좌측 패널 일러스트
│   └── landing/                  ← 랜딩 페이지 씬별 배경 이미지
│       ├── hero.jpg
│       ├── explore.jpg
│       ├── voice.jpg
│       └── social.jpg
│
├── docs/                         ← 이 문서 허브
├── Dockerfile                    ← 멀티스테이지 빌드 (dev / prod)
├── docker-compose.yml            ← 로컬 개발(app) + 프로덕션(app-prod) 서비스
├── middleware.ts                 ← Next.js 전역 미들웨어 (lib/auth/middleware.ts 호출)
├── .env.example                  ← 환경변수 템플릿
├── next.config.ts
└── package.json
```

---

## 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | GSAP 스크롤 크로스페이드 랜딩 페이지 — 4개 씬 + 히어로 clip-path 애니메이션 |
| `components/world/WorldCanvas.tsx` | Mapbox + Three.js 통합 진입점 — 이동·음성·채팅·섹터 루프 전체 |
| `lib/map/context.ts` | Mapbox WebGLContext를 Three.js에 공유하는 유일한 초기화 진입점 ([ADR 001](../adr/001-webgl-context-sharing.md)) |
| `lib/map/camera.ts` | `dragPan.disable()` + `move` 이벤트 강제 리셋 ([ADR 007](../adr/007-quarter-view-camera-lock.md)) |
| `lib/three/fog.ts` | 유저 가시거리 등급에 따른 CSS Vignette 반경 계산·적용 |
| `lib/three/prune.ts` | 50m 이동마다 반경 450m 외곽 오브젝트 `geometry.dispose()` 배치 |
| `lib/geo/validator.ts` | 직전 좌표 대비 이동 속도 계산 → 30km/h 초과 시 좌표 드롭 |
| `lib/auth/session.ts` | JWT Payload 파싱 (`visibility_radius_m` 추출) + Access Token 갱신 |
| `lib/auth/middleware.ts` | `(game)`, `store`, `admin` 라우트 인증 검사 + 광고주 Role 검증 |
| `supabase/functions/spatial-query/` | `ST_DWithin` 쿼리로 반경 내 스폰서 랜드마크 목록 반환 |
| `supabase/functions/livekit-token/` | LiveKit Cloud 룸 접속 JWT 토큰 발급 |

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [프론트엔드 컨벤션](../frontend/conventions.md)
- [백엔드 컨벤션 — Edge Functions 파일 구조](../backend/conventions.md)
- [온보딩 — 개발 명령어](../onboarding/commands.md)
