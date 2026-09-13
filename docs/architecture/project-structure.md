# 프로젝트 구조

```
project/
├── app/                          ← Next.js App Router
│   ├── (auth)/                   ← 인증 라우트 그룹 (비인증 진입점)
│   │   ├── login/page.tsx        ← 이메일+비밀번호 + 카카오/구글 소셜 로그인 (58/42 스플릿 레이아웃)
│   │   ├── verify/page.tsx       ← 소셜 로그인 콜백 처리 화면
│   │   └── layout.tsx
│   ├── (game)/                   ← 인게임 라우트 그룹 (인증 필수)
│   │   ├── dashboard/page.tsx    ← 로그인 후 메인 대시보드 (3D 월드 씬 마운트)
│   │   ├── store/page.tsx        ← 아바타·라이선스 상점 (결제 플로우)
│   │   └── layout.tsx
│   ├── api/                      ← Next.js Route Handler = BFF 프록시 (NestJS로 전달)
│   │   ├── auth/                 ← login, logout, register, refresh,
│   │   │                            oauth/[provider], oauth/[provider]/callback
│   │   ├── billing/              ← orders, products
│   │   ├── me/                   ← characters, license
│   │   ├── voice/                ← token
│   │   └── health/
│   ├── summer-afternoon/         ← 3D 월드 씬 진입점 (scene, thirdPerson, audio, rampShader)
│   ├── preview/                  ← 개발용 미리보기
│   ├── globals.css
│   ├── icon.svg
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
│   │   ├── WorldCanvas.tsx       ← 메인 월드 3D 씬 진입점 (Three.js 단일 WebGL 캔버스)
│   │   └── MiniMap.tsx           ← 5시 GIS 미니맵 (독립 경량 Mapbox GL 캔버스, GPS 위치)
│   ├── avatar/
│   │   └── AvatarCard.tsx        ← 아바타 선택·미리보기 카드 (상점·결제 플로우 연결)
│   ├── transition/               ← 페이지 전환 연출
│   │   ├── PageTransition.tsx
│   │   └── CuteLoader.tsx
│   └── ui/                       ← 공통 UI (버튼, 카드, 토스트, 스피너)
│
├── lib/                          ← 클라이언트 공유 로직
│   ├── api/                      ← NestJS 프록시 계층
│   │   ├── client.ts             ← 브라우저 fetch 래퍼 (Bearer 액세스 토큰)
│   │   ├── config.ts             ← API 주소·엔드포인트 상수
│   │   └── proxy.ts              ← Route Handler에서 NestJS로 전달 (Authorization 헤더 패스스루)
│   ├── auth/
│   │   ├── session.ts            ← JWT 파싱 + 액세스 토큰 갱신 헬퍼
│   │   └── middleware.ts         ← 라우트 보호 미들웨어 로직
│   ├── geo/
│   │   ├── currentPosition.ts    ← 단발 GPS 좌표 조회 (미니맵 위치 표시용)
│   │   ├── watchPosition.ts      ← GPS 실시간 추적 (미니맵 위치 표시용)
│   │   ├── validator.ts          ← 클라이언트 속도 검증 (씬 좌표 기준 30km/h 드롭)
│   │   └── sector.ts             ← 섹터 경계 Pre-Join 로직
│   ├── map/
│   │   ├── context.ts            ← 5시 GIS 미니맵 Mapbox GL 초기화 (단일 진입점)
│   │   ├── camera.ts             ← 미니맵 유저 추적 고정 + 드래그/줌 잠금
│   │   └── snap.ts               ← 씬에 구워진 오솔길 에셋 위 이동 보정
│   ├── three/
│   │   ├── character.ts          ← GLB 로드 + Walk/Idle 애니메이션
│   │   ├── binLoader.ts          ← 바이너리 에셋 로더
│   │   ├── fog.ts                ← 씬 뷰 디스턴스(거리 안개) 반경 제어
│   │   └── prune.ts              ← 반경 450m 외곽 dispose() 배치
│   ├── realtime/
│   │   └── world.ts              ← socket.io 월드 연결 (위치·채팅 브로드캐스트)
│   ├── voice/
│   │   ├── livekit.ts            ← LiveKit 룸 조인·파기
│   │   └── spatial-audio.ts      ← 볼륨 감쇠 + 3D 패닝
│   └── utils.ts
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
│   └── avatars/                  ← service, module (외형 조합 · GLB 생성)
│
├── supabase/migrations/          ← PostgreSQL 마이그레이션 SQL 0001~0010
│                                    (PostGIS, pg_cron, pgcrypto, citext)
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
├── docker-compose.yml            ← 로컬 개발(app = Next.js 프론트, WATCHPACK_POLLING 핫 리로드)
├── middleware.ts                 ← Next.js 전역 미들웨어 (lib/auth/middleware.ts 호출)
├── next.config.ts
├── .env.example                  ← 프론트엔드 환경변수 템플릿
├── apps/api/.env.example         ← API 서버 환경변수 템플릿
└── package.json
```

제품 진입은 3D 씬(루트)이다. `app/(game)`의 실제 라우트는 `/dashboard`와 `/store`이며, 메인 월드
3D 씬 진입점은 `components/world/WorldCanvas.tsx`로 대시보드 라우트에서 마운트된다. 랜딩/마케팅 웹은
추후 별도 앱으로 분리한다(로드맵 참고). 현재 구조는 루트 Next.js 앱과 `apps/api` NestJS를 한 저장소에
코로케이션한 형태다.

---

## 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | GSAP 스크롤 크로스페이드 랜딩 페이지 — 4개 씬 + 히어로 clip-path 애니메이션 |
| `app/(game)/store/page.tsx` | 아바타·라이선스 상점 — PG 결제 요청 및 발급 상태 폴링 |
| `components/world/WorldCanvas.tsx` | 메인 월드 3D 씬 진입점 — 이동·음성·채팅·섹터 루프 전체 (Three.js 단일 WebGL 캔버스) |
| `components/world/MiniMap.tsx` | 5시 GIS 미니맵 — 독립 Mapbox GL 캔버스에 유저 실제 GPS 위치 표시 |
| `components/avatar/AvatarCard.tsx` | 아바타 선택·미리보기 카드 — 상점·결제 플로우와 연결 |
| `lib/api/proxy.ts` | Route Handler에서 NestJS로 요청 전달, `Authorization` 헤더 패스스루 |
| `lib/realtime/world.ts` | socket.io 월드 연결 — 섹터 채널 위치·채팅 송수신 (씬 로컬 좌표) |
| `lib/map/context.ts` | 5시 GIS 미니맵 Mapbox GL 초기화 진입점 ([ADR 001](../adr/001-webgl-context-sharing.md)) |
| `lib/map/camera.ts` | 미니맵 유저 추적 고정 — `dragPan.disable()` + 위치 중심 리셋 ([ADR 007](../adr/007-quarter-view-camera-lock.md)) |
| `lib/three/fog.ts` | 유저 가시거리 등급에 따른 씬 뷰 디스턴스(거리 안개) 반경 계산·적용 |
| `lib/three/prune.ts` | 50m 이동마다 반경 450m 외곽 오브젝트 `geometry.dispose()` 배치 |
| `lib/geo/validator.ts` | 직전 씬 좌표 대비 이동 속도 계산 → 30km/h 초과 시 좌표 드롭 |
| `lib/auth/session.ts` | JWT Payload 파싱 (`visibility_radius_m` 추출) + 액세스 토큰 갱신 |
| `lib/auth/middleware.ts` | `(game)`, `store`, `admin` 라우트 인증 검사 + 광고주 Role 검증 |
| `apps/api/src/world/world.gateway.ts` | socket.io 게이트웨이 — 섹터 판정·속도 검증·5Hz 묶음 브로드캐스트 |
| `apps/api/src/billing/fulfillment.worker.ts` | 결제 완료 주문을 폴링해 아바타·라이선스 발급 |
| `apps/api/src/voice/voice.controller.ts` | LiveKit Cloud 룸 접속 JWT 토큰 발급 |
| `apps/api/src/database/database.service.ts` | pg Pool + 트랜잭션별 `app.user_id`/`app.user_role` RLS 컨텍스트 주입 |

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [프론트엔드 컨벤션](../frontend/conventions.md)
- [백엔드 컨벤션](../backend/conventions.md)
- [온보딩 — 개발 명령어](../onboarding/commands.md)
