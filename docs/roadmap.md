# 개발 로드맵

> 기반 문서: [docs/prd.md](./prd.md), [docs/architecture/overview.md](./architecture/overview.md)
> 원칙: 각 Phase의 완료 기준을 충족해야 다음 Phase로 진행한다.

---

## 진행 현황

- [x] **Phase 0** — 프로젝트 초기화 및 인프라 셋업
- [x] **Phase 1** — UI/UX 기반 구축
- [x] **Phase 2** — 3D 숲 씬 이동 + 실시간 위치 동기화
- [x] **Phase 3** — LiveKit 공간 음성
- [x] **Phase 4** — 인앱 결제 + 아바타 발급 + 가시거리 라이선스
- [ ] **Phase 5** — B2B 스폰서십 광고 + 씬 뷰 디스턴스 연동
- [ ] **Phase 6** — 상용화 및 프로덕션 안정화

---

## Phase 0 — 프로젝트 초기화 및 인프라 셋업

> 코드 작성 전 로컬 개발 환경과 인프라를 완전히 갖춘다.

- **P0-1.** Next.js 프론트엔드 초기화 `[Infra]`
  - `package.json` — Next.js 15, Mapbox GL JS v3, Three.js, socket.io-client, LiveKit 의존성 정의
  - `next.config.ts` — Mapbox GL JS 처리
  - 루트 `.env.example` — 프론트엔드 환경변수 템플릿
  - 검증
    - `npm install` 성공
    - `npm run type-check` 오류 없음

- **P0-2.** NestJS API 서버 초기화 `[Infra]`
  - `apps/api` — NestJS 11 프로젝트 구성 (`main.ts`, `app.module.ts`, `health.controller.ts`)
  - `apps/api/.env.example` — API 서버 환경변수 템플릿
  - `database` 모듈 — pg Pool + RLS 컨텍스트 서비스
  - 검증
    - `npm run start:dev` 정상 기동
    - `GET /api/health` 200 응답

- **P0-3.** PostgreSQL + 마이그레이션 `[DB]`
  - PostgreSQL 마이그레이션 SQL 작성 (`supabase/migrations/` 경로, `0001`~)
    - `0001` — PostGIS, pg_cron, pgcrypto, citext 확장 활성화
    - `0002` — `users`, `user_identities` + `app_api` 롤 + RLS 정책
    - 이후 — `characters`, `orders`, `user_licenses`, `sponsor_buildings`, `ad_impressions`
  - 검증
    - psql로 마이그레이션 순차 적용 완료
    - `app_api` 롤로 접속 시 RLS 적용 확인

- **P0-4.** 배포 및 컨테이너 인프라 `[Infra]`
  - Vercel 프로젝트 생성 + GitHub 연결 + 프론트엔드 환경변수 등록
  - LiveKit Cloud 프로젝트 생성
  - `Dockerfile` (멀티스테이지) + `docker-compose.yml` 구성
  - 검증
    - `npm run dev` 정상 기동
    - Vercel Preview 배포 성공

**완료 기준**
- [x] psql 마이그레이션 순차 적용 완료
- [x] 프론트엔드 `npm run dev` + API 서버 `npm run start:dev` 정상 기동
- [x] Vercel Preview 배포 성공

---

## Phase 1 — UI/UX 기반 구축

> 인게임 진입 전 인증 플로우와 HUD를 완성하고, 이후 모든 Phase에서 재사용할 공통 컴포넌트 시스템을 확립한다.

- **P1-1.** 인증 플로우 `[FE][BE]`
  - `(auth)` 라우트 — 이메일+비밀번호 로그인 + 소셜 OAuth (카카오·구글) (Spot 스타일 58/42 스플릿 레이아웃)
  - NestJS `auth` 모듈 — 자체 JWT + bcrypt 발급, OAuth Authorization Code 교환(서버 처리)
  - `middleware.ts` — 미인증 시 `/login` 리다이렉트
  - 검증
    - 이메일+비밀번호 및 카카오/구글 OAuth 로그인 후 `/dashboard` 리다이렉트 성공

- **P1-2.** HUD 컴포넌트 `[FE]`
  - `components/hud/` — PC 방향키 UI(DirectionPad), 모바일 조이스틱(Joystick), 채팅 입력창(ChatInput)
  - PC(WASD) / 모바일(조이스틱) 입력 모드 반응형 전환
  - 검증
    - 모바일·PC 각각 HUD 정상 렌더링

- **P1-3.** 공통 컴포넌트 시스템 `[FE]`
  - `components/ui/` — 버튼(Button), 카드(Card), 토스트(Toast), 로딩 스피너(Spinner)
  - `components/avatar/` — 아바타 미리보기 카드(AvatarCard)
  - `components/layout/` — PC 사이드바(Sidebar), 모바일 하단 내비게이션(BottomNav)
  - `components/transition/` — 페이지 전환(PageTransition), 로더(CuteLoader)
  - 로딩·에러·빈 상태 처리 패턴 확립
  - 검증
    - `npm run type-check` 오류 없음

- **P1-4.** 랜딩 페이지 `[FE]`
  - `app/page.tsx` — GSAP 스크롤 크로스페이드, 4개 씬 (hero / explore / voice / social)
  - 히어로 카드 clip-path 애니메이션
    - scrollY=0: 라운드 카드 (inset 64/16/24px, radius 40px) → 스크롤 시 full-bleed 확장
    - SSR 초기 HTML에 clip-path 미포함 — 중간 스크롤 새로고침 시에도 항상 full-bleed 보장
    - raw scroll 이벤트 + `window.scrollY` 직접 계산으로 지연 없는 즉각 반응
    - `requestAnimationFrame` 보정으로 브라우저 history 스크롤 복원 타이밍 대응
  - 헤더 스크롤 방향 감지 자동 숨김·노출
  - 좌측 스크롤 위치 내비게이션 도트 (데스크탑)
  - `public/landing/` — 씬별 배경 사진 4장 (hero·explore·voice·social)
  - 검증
    - 중간 스크롤 위치 새로고침 시 full-bleed 이미지 초기 렌더링
    - scrollY=0 복귀 시 라운드 카드 즉각 복원
    - `prefers-reduced-motion` 시 애니메이션 정지
    - 모바일·PC 정상 렌더링

**완료 기준**
- [x] 랜딩 페이지 스크롤 크로스페이드 정상 동작
- [x] 로그인 → `/dashboard` 인게임 진입 전환 완성
- [x] 모바일·PC HUD 정상 렌더링
- [x] `npm run type-check` 오류 없음

---

## Phase 2 — 3D 숲 씬 이동 + 실시간 위치 동기화

> 브라우저에서 베이크드 로우폴리 3D 숲 씬을 열고 캐릭터를 이동시키며, 여러 유저가 서로의 위치를 실시간으로 본다. 5시 GIS 미니맵은 실제 GPS 위치를 표시한다. 섹터 판정·속도 검증·브로드캐스트 묶음은 서버가 담당한다.

- **P2-1.** 3D 숲 씬 + WebGL 렌더링 `[3D]`
  - Next.js CSR 모드에서 단일 Three.js WebGL 캔버스로 베이크드 로우폴리 숲 씬 초기화 (`app/summer-afternoon/`)
  - 오솔길·집·창고·나무·바위·랜드마크를 씬에 구워진 정적/인스턴스 에셋으로 배치 ([ADR 001](./adr/001-webgl-context-sharing.md))
  - 검증
    - 숲 씬 정상 렌더링, 단일 `<canvas>` 확인

- **P2-2.** 로우폴리 캐릭터 + 카메라 `[3D]`
  - Three.js 로우폴리 GLB 캐릭터 렌더링 (`lib/three/character.ts`)
  - 3인칭 추적 카메라 (`components/world/WorldCanvas.tsx`, `app/summer-afternoon/thirdPerson`) ([ADR 007](./adr/007-quarter-view-camera-lock.md))
  - 5시 GIS 미니맵(독립 Mapbox GL 캔버스) — 유저 위치 고정 추적 + 드래그·줌 잠금(`dragPan disable`)
  - 기본 가시거리 씬 뷰 디스턴스(거리 안개)
  - 검증
    - 캐릭터 렌더링 확인, 미니맵 위치 추적·조작 차단 확인

- **P2-3.** WASD/조이스틱 씬 이동 + GPS 미니맵 `[FE]`
  - 키보드 WASD·가상 조이스틱으로 씬 내 캐릭터 이동 구현
  - 모바일 GPS 좌표를 5시 미니맵에 실시간 표시 (`lib/geo/`)
  - Three.js 반경 450m 바깥 오브젝트 Prune (50m 이동마다 비동기 GC, `lib/three/prune.ts`)
  - 검증
    - 캐릭터 씬 이동 및 미니맵 GPS 표시 동작 확인
    - 450m 외곽 오브젝트 정리 후 메모리 누수 없음

- **P2-4.** socket.io 섹터 브로드캐스트 + 속도 검증 `[BE]`
  - NestJS `world` 게이트웨이(`apps/api/src/world/world.gateway.ts`) — 섹터 단위로 씬 로컬 좌표를 묶어 5Hz 브로드캐스트
  - 섹터 판정·속도 검증을 서버에서 수행 (`apps/api/src/world/sector.ts`)
  - 위치·채팅은 DB에 저장하지 않는 휘발성 브로드캐스트
  - 브라우저는 `NEXT_PUBLIC_WS_URL`로 socket.io 직접 접속 (`lib/realtime/world.ts`)
  - 검증
    - 여러 브라우저 창에서 상대 위치 지연 500ms 이하 동기화
    - 시속 30km 초과 패킷 서버 드롭 확인

**완료 기준**
- [x] 여러 브라우저 창에서 각자 캐릭터를 이동할 때 상대 위치가 지연 500ms 이하로 동기화
- [x] 속도 초과 패킷 서버 드롭 확인

---

## Phase 3 — LiveKit 공간 음성

> 근접한 유저가 말할 때 상대방 위치에서 소리가 들리는 공간 음성.

- **P3-1.** LiveKit 룸 토큰 발급 `[BE]`
  - NestJS `voice` 모듈이 `livekit-server-sdk`로 룸 토큰 발급 ([ADR 003](./adr/003-livekit-cloud-sfu.md))
  - `POST /api/voice/token` 프록시 경유
  - 검증
    - 토큰 발급 API 호출 성공

- **P3-2.** 거리 기반 음성 자동 연결 `[FE][BE]`
  - 반경 30m 진입 시 룸 자동 조인, 40m 이탈 시 즉시 disconnect
  - 거리 기반 볼륨 감쇠 + 3D 오디오 패닝 (Web Audio API PannerNode, `lib/voice/spatial-audio.ts`)
  - Top-8 구독 Capping + 거리 순 Eviction 큐
  - 마이크 권한 옵트인 처리 (거부 시 수신만 활성화)
  - 검증
    - 두 기기에서 30m 이내 접근 시 음성 연결 2초 이내
    - 40m 이탈 시 즉시 연결 해제

**완료 기준**
- [x] 두 기기에서 30m 이내 접근 시 음성 연결 2초 이내
- [x] 40m 이탈 시 즉시 연결 해제

---

## Phase 4 — 인앱 결제 + 아바타 발급 + 가시거리 라이선스

> 원화 결제로 유니크 아바타를 발급하고 가시거리 안개를 영구 확장한다.

- **P4-1.** PG 결제 웹훅 연동 `[BE]`
  - 토스페이먼츠 / 카카오페이 웹훅 → NestJS `billing` 모듈 ([ADR 004](./adr/004-direct-krw-payment.md))
  - 웹훅 서명 검증 위해 raw body 보존 (`PG_WEBHOOK_SECRET`)
  - 멱등성은 DB 제약으로 보장 (`orders_pg_approval_uniq`)
  - 결제 실패 시 PG사 자동 취소 + CS 로그 적재
  - 검증
    - 결제 완료 후 아바타 발급까지 5초 이내
    - 실패 시 3초 이내 자동 취소

- **P4-2.** 아바타 발급 파이프라인 `[BE]`
  - 발급 워커(`apps/api/src/billing/fulfillment.worker.ts`) — 아바타/라이선스 발급
  - `characters` 테이블 `appearance_hash` UNIQUE로 외형 충돌 방지
  - 묶음 상품 멱등 발급 (`characters_order_item_uniq`)
  - `appearance_hash` 기반 외형 조합 발급 ("주문 제작 중" 로딩 연출)
  - 검증
    - 동일 `appearance_hash` 중복 발급 차단 확인
    - 웹훅 중복 수신 시 단 1회만 발급 확인

- **P4-3.** 가시거리 라이선스 + 상점 UI `[FE]`
  - JWT Payload에 가시거리 등급 인코딩 (Stateless 검증)
  - `app/(game)/store` — 상품 카드·결제 UI
  - 씬 뷰 디스턴스(거리 안개) 반경 실시간 확장 연출 (0.1초 Transition)
  - `GET /api/me/characters`, `GET /api/me/license`, `GET /api/billing/products`, `POST /api/billing/orders`
  - 검증
    - 결제 완료 후 안개 반경 즉시 확장 확인

**완료 기준**
- [x] 결제 완료 후 아바타 발급까지 5초 이내
- [x] 실패 시 3초 이내 자동 취소
- [x] 동일 `appearance_hash` 중복 발급 차단

---

## Phase 5 — B2B 스폰서십 광고 + 씬 뷰 디스턴스 연동

> 광고주가 셀프 서비스로 숲 속 특정 랜드마크에 브랜드 텍스처를 매핑하고 노출 통계를 확인한다. 랜드마크 좌표는 5시 GIS 미니맵의 마커 레이어에도 표시된다.

- **P5-1.** PostGIS 공간 쿼리 `[DB]`
  - `ST_DWithin` 기반 반경 내 스폰서 랜드마크 감지 쿼리 (`geom::geography` 캐스팅)
  - GiST 인덱스 기반 성능 튜닝 ([ADR 005](./adr/005-postgis-gist-index.md))
  - 검증
    - 10개 스폰서 랜드마크 감지 쿼리가 10ms 이하

- **P5-2.** 광고주 포탈 `[FE][BE]`
  - 광고주(`role: advertiser`) 포탈 — 미니맵 좌표 선택 + 이미지 업로드 + 원화 결제
  - `sponsor_buildings` 테넌시 격리 RLS 정책 (광고주 간 데이터 격리)
  - 검증
    - 광고주 포탈 정상 접근 및 랜드마크 좌표 등록 성공
    - 타 광고주 데이터 접근 차단(RLS) 확인

- **P5-3.** 브랜드 텍스처 매핑 + 유효 노출 `[3D][BE]`
  - Three.js TextureLoader로 씬 내 랜드마크(그루터기·바위 등) 간판 UV에 브랜드 로고 실시간 매핑 + 미니맵 좌표 마커 표시
  - 유효 노출 카운팅 (1초 이상 씬 뷰포트 내 완전 진입 시만 `ad_impressions` 기록)
  - 무료 유저 씬 뷰 디스턴스 경계(35m)에 스폰서 랜드마크 실루엣 + Glow 효과
  - 검증
    - 브랜드 텍스처 씬 내 정상 렌더링 확인
    - 1초 미만 노출은 기록 제외 확인

- **P5-4.** pg_cron 광고 자동화 `[DB]`
  - pg_cron `activate-ads` — 매일 15:00 UTC(=00:00 KST) 광고 기간 자동 활성/비활성
  - 비활성화 시 `default_texture_url`로 자동 원복
  - 검증
    - 광고주 등록 완료 후 익일 새벽 스케줄러 실행 시 랜드마크 텍스처 자동 교체

**완료 기준**
- [ ] 10개 스폰서 랜드마크 감지 쿼리가 10ms 이하
- [ ] 광고주 등록 완료 후 익일 새벽 스케줄러 실행 시 랜드마크 텍스처 자동 교체
- [ ] 광고주 간 데이터 테넌시 격리(RLS) 확인

---

## Phase 6 — 상용화 및 프로덕션 안정화

> 실제 서비스 런칭을 위한 보안 강화, 부하 테스트, 비용 관리.

- **P6-1.** 보안 강화 `[Infra]`
  - Mapbox 토큰 도메인 락 + 모바일 Bundle ID 제한 적용 (미니맵)
  - RLS 정책 전수 점검 (`app.user_id`/`app_api` 롤/트랜잭션 범위 `SET LOCAL`)
  - 안전 경고 팝업 법적 면책 검토
  - 검증
    - 허용 도메인 외 Mapbox 토큰 차단 확인
    - 전역 `SET`(트랜잭션 밖 컨텍스트) 부재 확인

- **P6-2.** 부하 테스트 `[Infra]`
  - 동접 200명 기준 부하 테스트 (socket.io 섹터 브로드캐스트 + PostGIS 공간 쿼리)
  - 심야 시간대 (23:00~05:00) 실외 GPS 위치 표시 자동 잠금
  - 자체 호스팅 비용 시뮬레이션 (동접 증가 시 대응 플랜)
  - 검증
    - 동접 200명 기준 위치 업데이트 p99 레이턴시 1초 이하
    - 비용 목표 유지

**완료 기준**
- [ ] 동접 200명 기준 위치 업데이트 p99 레이턴시 1초 이하
- [ ] 자체 호스팅 비용 목표 유지

---

## Phase 의존 관계

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

---

## 구조 방향 (계획)

> 현재 구조는 "루트 Next.js 앱 + `apps/api` NestJS" 코로케이션이다. 아래는 향후 진행 방향으로, 현재 구조로 단정하지 않는다.

- **SaaS 우선 완성** — 인증·실시간·음성·결제·발급 등 서비스 백엔드(SaaS)를 먼저 완성하는 것을 우선순위로 둔다.
- **마케팅 웹사이트 별도 앱** — 서비스 소개/전환용 마케팅 웹사이트는 SaaS 완성 이후 별도 앱으로 제작한다.
- **모노레포 전환** — pnpm workspaces + Turborepo 기반 모노레포로 정리하는 것을 지향한다.
  ```
  apps/
  ├── app/    ← 게임 클라이언트 (Next.js)
  ├── web/    ← 마케팅 웹사이트 (추후 제작)
  └── api/    ← NestJS API 서버
  packages/   ← 공용 타입·UI·설정 등 공유 패키지
  ```
