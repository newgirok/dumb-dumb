# 프로젝트 구조

```
project/
├── app/                          ← Next.js App Router
│   ├── (auth)/                   ← 인증 라우트 그룹
│   │   ├── login/page.tsx        ← 이메일+비밀번호 + 카카오/구글 소셜 로그인 (58/42 스플릿 레이아웃)
│   │   ├── verify/page.tsx       ← 본인인증 자리표시 화면 (Phase 5 예정)
│   │   └── layout.tsx
│   ├── (game)/                   ← 대시보드·상점 라우트 그룹
│   │   ├── dashboard/page.tsx    ← 대시보드 월드 (WorldCanvas + Hud)
│   │   ├── store/page.tsx        ← 아바타·라이선스 상점 (결제 플로우)
│   │   └── layout.tsx            ← Sidebar(PC) + BottomNav(모바일) 셸
│   ├── api/                      ← Next.js Route Handler = BFF 프록시 (NestJS로 전달)
│   │   ├── auth/                 ← login, logout, register, refresh,
│   │   │                            oauth/[provider], oauth/[provider]/callback
│   │   ├── billing/              ← orders, products
│   │   ├── me/                   ← characters, license
│   │   ├── voice/                ← token
│   │   └── health/
│   ├── summer-afternoon/         ← 루트 3D 씬 (scene, thirdPerson, rampShader, audio)
│   ├── preview/                  ← ref-assets 에셋 뷰어 (개발용)
│   ├── globals.css
│   ├── icon.svg
│   ├── layout.tsx                ← 루트 레이아웃 (Nunito·JetBrains Mono 폰트, PageTransition)
│   └── page.tsx                  ← 제품 진입점 (루트에서 summer-afternoon 씬 렌더)
│
├── components/                   ← 공유 React 컴포넌트
│   ├── hud/                      ← 대시보드 HUD
│   │   ├── index.tsx             ← Hud — 화면 UI 없이 이동·채팅 연결 인터페이스만 제공
│   │   ├── DirectionPad.tsx      ← 방향키 UI (Hud에서 렌더하지 않음)
│   │   ├── Joystick.tsx          ← 가상 조이스틱 UI (Hud에서 렌더하지 않음)
│   │   └── ChatInput.tsx         ← 채팅 입력 UI (Hud에서 렌더하지 않음)
│   ├── layout/                   ← (game) 레이아웃 셸
│   │   ├── Sidebar.tsx           ← PC 좌측 사이드바 (대시보드·상점·내 위치로·로그아웃)
│   │   └── BottomNav.tsx         ← 모바일 하단 내비게이션
│   ├── world/
│   │   ├── WorldCanvas.tsx       ← 대시보드 월드 (Mapbox 지도 + Three.js 커스텀 레이어)
│   │   └── MiniMap.tsx           ← 5시 GIS 미니맵 (루트 3D 씬 전용, 독립 Mapbox GL 캔버스)
│   ├── avatar/
│   │   └── AvatarCard.tsx        ← 아바타 미리보기 카드 (페이지에 연결되지 않음)
│   ├── transition/               ← 페이지 전환 연출
│   │   ├── PageTransition.tsx
│   │   └── CuteLoader.tsx
│   └── ui/                       ← 공통 UI (Button, Card, Spinner, Toast)
│
├── lib/                          ← 클라이언트 공유 로직
│   ├── api/                      ← NestJS 프록시 계층
│   │   ├── client.ts             ← 브라우저 fetch 래퍼 (Bearer 액세스 토큰)
│   │   ├── config.ts             ← API 주소(`API_URL`)·쿠키 이름·쿠키 옵션
│   │   └── proxy.ts              ← Route Handler에서 NestJS로 전달 (Authorization 헤더 패스스루)
│   ├── auth/
│   │   ├── session.ts            ← 액세스 토큰 메모리 보관·리프레시, 로그인·가입·로그아웃
│   │   └── middleware.ts         ← 라우트 보호 로직 (전역 미들웨어에 연결하지 않음)
│   ├── geo/
│   │   ├── currentPosition.ts    ← 단발 GPS 좌표 조회 (대시보드 월드 시작 위치·내 위치로)
│   │   ├── watchPosition.ts      ← GPS 실시간 추적 (미니맵 위치 표시, 대시보드 월드 모바일 이동)
│   │   ├── validator.ts          ← 클라이언트 속도 검증 (위경도 기준 30km/h 드롭)
│   │   └── sector.ts             ← 섹터 계산 재노출 배럴 (shared/world/sector)
│   ├── map/                      ← 대시보드 월드 지도 계층
│   │   ├── context.ts            ← Mapbox 지도 + Three.js 커스텀 레이어 초기화 (WebGL 컨텍스트 공유)
│   │   ├── camera.ts             ← 지도 카메라 잠금 (pitch·bearing 고정, 줌 14~20) + 캐릭터 추적
│   │   └── snap.ts               ← 이동 좌표를 15m 이내 도로 선분으로 스냅
│   ├── three/
│   │   ├── binLoader.ts          ← ref-assets .bin(Draco) 로더 + 스킨·애니메이션·인스턴스 LOD 헬퍼
│   │   ├── character.ts          ← kid 스킨드 캐릭터(idle/run) + 절차적 폴백 메시
│   │   ├── fog.ts                ← Fog of War CSS 비네트 반경 헬퍼 (어느 월드에도 연결하지 않음)
│   │   └── prune.ts              ← 반경 450m 외곽 dispose() 배치
│   ├── realtime/
│   │   └── world.ts              ← socket.io 월드 연결 (위치·채팅 브로드캐스트)
│   ├── voice/
│   │   ├── livekit.ts            ← LiveKit 섹터 룸 조인·파기 + Top-8 구독
│   │   └── spatial-audio.ts      ← 볼륨 감쇠 + 3D 패닝
│   └── utils.ts                  ← `cn()` — clsx + 커스텀 토큰을 아는 tailwind-merge
│
├── apps/api/src/                 ← NestJS API 서버
│   ├── main.ts                   ← 부트스트랩 (raw body 보존 · CORS · 포트)
│   ├── app.module.ts
│   ├── health.controller.ts
│   ├── database/                 ← pg Pool + RLS 컨텍스트 (module, service)
│   ├── users/                    ← me.controller, user.entity, users.service, module
│   ├── auth/                     ← controller, service, types, module (decorator/ dto/ guard/ oauth/)
│   ├── world/                    ← world.gateway (socket.io), sector.ts, module
│   ├── voice/                    ← voice.controller, module (LiveKit 토큰 발급)
│   ├── billing/                  ← controller, service, fulfillment.service, fulfillment.worker, module
│   └── avatars/                  ← service, module (외형 조합 · 고유 시리얼 발급)
│
├── shared/world/                 ← 프론트·백엔드 공유 단일 소스(SSOT)
│   ├── contract.ts               ← 월드 소켓 이벤트 계약 (socket.io 제네릭 타입)
│   └── sector.ts                 ← 섹터 격자(500m)·거리·이동 검증 계산
│
├── supabase/migrations/          ← PostgreSQL 마이그레이션 SQL 0001~0010
│                                    (PostGIS, pg_cron, pgcrypto, citext)
├── supabase/functions/           ← Supabase Edge Function (livekit-token, spatial-query) — 앱에서 호출하지 않음
│
├── public/
│   ├── illustration-login.png    ← 로그인 화면 좌측 패널 일러스트
│   ├── landing/                  ← 랜딩 배경 이미지 (앱 코드에서 참조하지 않음)
│   │   ├── hero.jpg
│   │   ├── explore.jpg
│   │   ├── voice.jpg
│   │   └── social.jpg
│   └── ref-assets/               ← 루트 3D 씬 에셋 + 두 월드 공용 kid 캐릭터
│       ├── geometries/           ← .bin 지오메트리·본·애니메이션·인스턴스·충돌 메시
│       ├── images/               ← 텍스처(PNG·KTX2), LUT, 인트로 전환 이미지
│       ├── audio/                ← 배경음·효과음 (mp3)
│       ├── fonts/                ← Stylish
│       ├── libs/                 ← draco·basis 디코더
│       └── MANIFEST.json
│
├── docs/                         ← 이 문서 허브
├── Dockerfile                    ← 멀티스테이지 빌드 (dev / builder / runner)
├── docker-compose.yml            ← app(개발, WATCHPACK_POLLING 핫 리로드) + app-prod(prod 프로필)
├── middleware.ts                 ← Next.js 전역 미들웨어 (matcher가 비어 있어 실행되지 않음)
├── next.config.ts
├── .env.example                  ← 프론트엔드 환경변수 템플릿
├── apps/api/.env.example         ← API 서버 환경변수 템플릿
└── package.json
```

제품 진입은 루트 3D 씬(`/`)이다. `app/page.tsx`가 `app/summer-afternoon/scene.tsx`를 그대로 렌더하며, 이 씬은
로그인·서버 연결 없이 동작한다. `app/(game)`의 라우트는 `/dashboard`와 `/store`이고, 대시보드 월드는
`components/world/WorldCanvas.tsx`가 `/dashboard`에서 마운트한다. 페이지 라우트 게이팅은 꺼져 있어
(`middleware.ts`의 `matcher`가 비어 있음) 모든 페이지가 공개이며, 인증 재도입 시 연결할 보호 로직은
`lib/auth/middleware.ts`에 둔다. 랜딩/마케팅 웹은 추후 별도 앱으로 분리한다(로드맵 참고). 현재 구조는 루트
Next.js 앱과 `apps/api` NestJS를 한 저장소에 코로케이션한 형태다. 섹터 계산과 소켓 이벤트 계약은
`shared/world/`에 단일 소스로 두고, 프론트(`lib/geo/sector.ts`, `lib/realtime/world.ts`)와
백엔드(`apps/api/src/world/sector.ts`)가 이를 재노출해 같은 구현을 참조한다.

---

## 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | 제품 진입점 — 루트(`/`)에서 `app/summer-afternoon/scene.tsx`를 그대로 렌더한다(씬 전용 URL 없음) |
| `app/summer-afternoon/scene.tsx` | 루트 3D 씬 — ref-assets 로드·씬 조립·렌더 루프, 우상단 HUD·정보 모달·secret 모달, 5시 미니맵 마운트 |
| `app/summer-afternoon/thirdPerson.ts` | 루트 3D 씬 3인칭 조작·카메라 리그 ([ADR 007](../adr/007-quarter-view-camera-lock.md)) |
| `app/(game)/store/page.tsx` | 아바타·라이선스 상점 — 상품·주문·내 아바타·가시거리 조회, 주문서(`PENDING`) 발행 후 다시 조회 |
| `components/world/WorldCanvas.tsx` | 대시보드 월드 — Mapbox 지도 + Three.js 커스텀 레이어, 이동·도로 스냅·위치 동기화·섹터 음성·프루닝 루프 |
| `components/world/MiniMap.tsx` | 5시 GIS 미니맵 — 루트 3D 씬 전용 독립 Mapbox GL 캔버스에 유저 실제 GPS 위치 표시 |
| `lib/api/proxy.ts` | Route Handler에서 NestJS로 요청 전달, `Authorization` 헤더 패스스루 |
| `lib/realtime/world.ts` | socket.io 월드 연결 — 섹터 채널 위치·채팅 송수신 (위경도) |
| `lib/map/context.ts` | 대시보드 월드 초기화 진입점 — Mapbox 지도에 Three.js 커스텀 레이어를 올린다 ([ADR 001](../adr/001-webgl-context-sharing.md)) |
| `lib/map/camera.ts` | 대시보드 월드 지도 카메라 잠금 — pitch·bearing 고정, 줌 14~20, 이동 시 지도 중심을 캐릭터로 맞춤(`followPlayer`) ([ADR 007](../adr/007-quarter-view-camera-lock.md)) |
| `lib/map/snap.ts` | 이동 좌표를 15m 이내 Mapbox 도로 선분의 최근접점으로 보정 |
| `lib/three/fog.ts` | Fog of War CSS 비네트 반경 헬퍼 — 어느 월드에도 연결되어 있지 않다 ([ADR 006](../adr/006-fog-of-war-business-model.md)) |
| `lib/three/prune.ts` | 50m 이동마다 반경 450m 밖 피어 오브젝트를 씬에서 빼고, 공유되지 않는 지오메트리·재질 해제 (대시보드 월드) |
| `lib/geo/validator.ts` | 직전 좌표 대비 이동 속도 계산 → 30km/h 초과 시 전송 드롭 (위경도) |
| `lib/auth/session.ts` | 액세스 토큰 메모리 보관·리프레시, 로그인·가입·로그아웃, JWT에서 유저 ID·이메일·역할 파싱 |
| `lib/auth/middleware.ts` | `/dashboard`·`/store`·`/admin` 세션 쿠키 검사 → `/login` 리다이렉트 (전역 미들웨어에 연결하지 않음) |
| `apps/api/src/world/world.gateway.ts` | socket.io 게이트웨이 — 섹터 판정·속도 검증·5Hz 묶음 브로드캐스트 (`shared/world/contract` 제네릭 타입) |
| `shared/world/contract.ts` | 월드 소켓 이벤트 이름·페이로드 계약 — 프론트·백엔드 socket.io 제네릭 단일 소스 |
| `shared/world/sector.ts` | 섹터 격자(500m)·거리·이동 속도 검증 계산 — 프론트·백엔드 단일 소스 |
| `apps/api/src/billing/fulfillment.worker.ts` | 결제 완료 주문을 폴링해 아바타·라이선스 발급 |
| `apps/api/src/voice/voice.controller.ts` | LiveKit Cloud 섹터 룸 접속 JWT 토큰 발급 |
| `apps/api/src/database/database.service.ts` | pg Pool + 트랜잭션별 `app.user_id`/`app.user_role` RLS 컨텍스트 주입 |

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [프론트엔드 컨벤션](../frontend/conventions.md)
- [백엔드 컨벤션](../backend/conventions.md)
- [온보딩 — 개발 명령어](../onboarding/commands.md)
