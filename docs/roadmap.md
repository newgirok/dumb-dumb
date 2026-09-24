# 개발 로드맵

> 기반 문서: [docs/prd.md](./prd.md), [docs/architecture/overview.md](./architecture/overview.md)
> 원칙: 각 Phase의 완료 기준을 충족해야 다음 Phase로 진행한다.

---

## 진행 현황

- [x] **Phase 0** — 프로젝트 초기화 및 인프라 셋업
- [x] **Phase 1** — UI/UX 기반 구축
- [x] **Phase 2** — 3D 월드 이동 + 실시간 위치 동기화
- [ ] **Phase 3** — LiveKit 공간 음성 (남은 작업: 마이크 옵트인 UI 연결)
- [ ] **Phase 4** — 인앱 결제 + 아바타 발급 + 가시거리 라이선스 (남은 작업: PG 결제창 연동, 자동 취소, 발급 대기 연출)
- [ ] **Phase 5** — B2B 스폰서십 광고 + 씬 뷰 디스턴스 연동 + 채팅 UI
- [ ] **Phase 6** — 상용화 및 프로덕션 안정화

---

## Phase 0 — 프로젝트 초기화 및 인프라 셋업

> 코드 작성 전 로컬 개발 환경과 인프라를 완전히 갖춘다.

- **P0-1.** Next.js 프론트엔드 초기화 `[Infra]`
  - `package.json` — Next.js 15, React 19, Mapbox GL JS v3, Three.js, socket.io-client, livekit-client 의존성 정의
  - `next.config.ts` — `standalone` 출력(컨테이너 배포용)
  - 루트 `.env.example` — 프론트엔드 환경변수 템플릿
  - 검증
    - `npm install` 성공
    - `npm run type-check` 오류 없음

- **P0-2.** NestJS API 서버 초기화 `[Infra]`
  - `apps/api` — NestJS 11 프로젝트 구성 (`main.ts`, `app.module.ts`, `health.controller.ts`)
  - `main.ts` — raw body 보존(웹훅 서명 검증용), CORS, 포트 9001
  - `apps/api/.env.example` — API 서버 환경변수 템플릿
  - `database` 모듈 — pg Pool + RLS 컨텍스트 서비스
  - 검증
    - `npm run start:dev` 정상 기동
    - API 서버 `GET /health` 200 응답

- **P0-3.** PostgreSQL + 마이그레이션 `[DB]`
  - PostgreSQL 마이그레이션 SQL 작성 (`supabase/migrations/` 경로, `0001`~`0010`)
    - `0001` — PostGIS, pg_cron, pgcrypto 확장 활성화
    - `0002` — `characters`, `orders`, `user_licenses`(가시거리 기본 25m)
    - `0003`·`0004` — `sponsor_buildings`(GiST 인덱스, pg_cron `activate-ads`), `ad_impressions`
    - `0005` — 반경 내 스폰서 랜드마크 조회 함수 `nearby_sponsor_buildings`
    - `0006` — 자체 인증 `users`(citext, `token_version`)
    - `0007` — RLS 정책 + `app_api` 롤
    - `0008`·`0010` — 결제·발급 멱등 인덱스(`orders_pg_approval_uniq`, `characters_order_item_uniq`), 지급 재시도 카운터
    - `0009` — 소셜 로그인 `user_identities`
  - 검증
    - psql로 마이그레이션 순차 적용 완료
    - `app_api` 롤로 접속 시 RLS 적용 확인

- **P0-4.** 배포 및 컨테이너 인프라 `[Infra]`
  - Vercel 프로젝트 생성 + GitHub 연결 + 프론트엔드 환경변수 등록
  - LiveKit Cloud 프로젝트 생성
  - `Dockerfile` (멀티스테이지 dev / builder / runner) + `docker-compose.yml`(개발 `app`, 프로덕션 `app-prod` 프로필)
  - 검증
    - `npm run dev` 정상 기동
    - Vercel Preview 배포 성공

**완료 기준**
- [x] psql 마이그레이션 순차 적용 완료
- [x] 프론트엔드 `npm run dev` + API 서버 `npm run start:dev` 정상 기동
- [x] Vercel Preview 배포 성공

---

## Phase 1 — UI/UX 기반 구축

> 인증 플로우와 인게임 HUD 배선을 갖추고, 이후 모든 Phase에서 재사용할 공통 컴포넌트 시스템을 확립한다.

- **P1-1.** 인증 플로우 `[FE][BE]`
  - `(auth)` 라우트 — 이메일+비밀번호 로그인 + 소셜 OAuth (카카오·구글) (Spot 스타일 58/42 스플릿 레이아웃)
  - NestJS `auth` 모듈 — 자체 JWT + bcrypt 발급, OAuth Authorization Code 교환(서버 처리)
  - `lib/auth/middleware.ts` — 세션 쿠키 기준 라우트 보호 로직(`applyAuthMiddleware`). `middleware.ts`에는 연결하지 않아 모든 페이지 라우트가 공개다(연결 계획은 [구조 방향](#구조-방향-계획) 참고)
  - 검증
    - 이메일+비밀번호 로그인 후 `/dashboard` 이동
    - OAuth 콜백 성공 시 `/dashboard`, 실패 시 `/login?error=`로 리다이렉트

- **P1-2.** 인게임 HUD 배선 `[FE]`
  - `components/hud/index.tsx` `Hud` — 대시보드 월드에 이동(`onMove`)·채팅(`onChat`) 핸들러를 잇는 인터페이스. 화면에 그리는 HUD UI는 없다(`null` 렌더)
  - 이동 입력은 `WorldCanvas`가 직접 처리한다 — PC는 키보드, 모바일은 GPS(`pointer: coarse`로 자동 판별)
  - `DirectionPad`·`Joystick`·`ChatInput` 컴포넌트 파일은 있으나 렌더하지 않는다
  - 검증
    - PC 키보드·모바일 GPS 이동 모드 자동 판별 확인

- **P1-3.** 공통 컴포넌트 시스템 `[FE]`
  - `components/ui/` — 버튼(Button), 카드(Card), 토스트(Toast), 로딩 스피너(Spinner)
  - `components/avatar/` — 아바타 미리보기 카드(AvatarCard)
  - `components/layout/` — PC 사이드바(Sidebar, "내 위치로" GPS 재조회 버튼), 모바일 하단 내비게이션(BottomNav)
  - `components/transition/` — 페이지 전환(PageTransition), 로더(CuteLoader)
  - 로딩·에러·빈 상태 처리 패턴 확립
  - 검증
    - `npm run type-check` 오류 없음

**완료 기준**
- [x] 로그인 → `/dashboard` 인게임 진입 전환 완성
- [x] `npm run type-check` 오류 없음

---

## Phase 2 — 3D 월드 이동 + 실시간 위치 동기화

> 루트 3D 씬(`/`)은 로그인 없이 열리는 단독 3D 씬으로, 캐릭터를 3인칭으로 조작하고 5시 GIS 미니맵에 실제 GPS 위치를 표시한다. 서버 연결은 없다. 대시보드 월드(`/dashboard`)는 Mapbox 실지형 지도 위에서 캐릭터를 위경도로 이동시키며, 여러 유저가 서로의 위치를 실시간으로 본다. 섹터 판정·속도 검증·브로드캐스트 묶음은 서버가 담당한다.

- **P2-1.** 루트 3D 씬 + WebGL 렌더링 `[3D]`
  - `app/summer-afternoon/` — 씬이 직접 만드는 Three.js WebGL 캔버스 1개(CSR) + EffectComposer(RenderPass·LUT·인트로 전환 패스), 태양광 PCFSoft 그림자
  - `/ref-assets/` 참조 에셋 — Draco `.bin` 지오메트리(`lib/three/binLoader.ts`), PNG·KTX2 텍스처, 오디오
    - 지형·바다·하늘 돔, 집·창고·파라솔·간판·모래성·UFO, 나무·덤불·야자수·바위(LOD 인스턴스), 가로등·기계, 잔디, 생물 3종, 갈매기 25마리
  - 로딩 화면 → 인트로 전환(4초)과 카메라 돌리(6초)가 동시에 시작되고, 그 순간부터 조작 가능
  - 5시 GIS 미니맵은 씬과 별도의 Mapbox GL 캔버스로 띄운다 ([ADR 001](./adr/001-webgl-context-sharing.md))
  - 검증
    - 루트 3D 씬 정상 렌더링, 씬 캔버스와 미니맵 캔버스의 WebGL 컨텍스트 분리 확인

- **P2-2.** 캐릭터 + 카메라 `[3D]`
  - 루트 3D 씬 — kid 스킨드 메시(idle/run/air 애니메이션), 3인칭 추적 카메라(`app/summer-afternoon/thirdPerson.ts`, 시선 목표점 중심 반경 5.9m·앙각 9.866°) ([ADR 007](./adr/007-quarter-view-camera-lock.md))
  - 대시보드 월드 — ref-assets kid 스킨드 메시(`lib/three/character.ts`, 내 캐릭터만 로드 실패 시 절차적 메시 폴백)를 Mapbox 커스텀 레이어로 렌더(`lib/map/context.ts`). pitch 45°·bearing 45° 고정 쿼터뷰에 줌 14~20만 허용(`lib/map/camera.ts`)
  - 5시 GIS 미니맵(루트 3D 씬) — 독립 Mapbox GL 캔버스, 유저 위치 고정 추적 + 조작 전면 잠금(`interactive: false`, 줌 16)
  - 검증
    - 캐릭터 렌더링 확인, 미니맵 위치 추적·조작 차단 확인

- **P2-3.** 이동 + GPS `[FE]`
  - 루트 3D 씬 — WASD·방향키·마우스/터치 가상 조이스틱 이동, 스페이스·오른쪽 클릭 점프, 충돌 메시 지면 보행(도보 3m/s)
  - 대시보드 월드 — PC는 WASD·방향키 이동(남북 3m/s, 동서 약 2.4m/s), 모바일은 실제 GPS 이동(`lib/geo/watchPosition.ts`). 새 위치는 15m 이내 도로에 스냅(`lib/map/snap.ts`)
  - 루트 3D 씬 미니맵에 GPS 위치 실시간 표시 (`lib/geo/`)
  - 대시보드 월드 50m 이동마다 반경 450m 밖 피어 오브젝트 정리 (`lib/three/prune.ts`)
  - 검증
    - 두 월드의 캐릭터 이동 및 미니맵 GPS 표시 동작 확인
    - 450m 외곽 오브젝트 정리 후 메모리 누수 없음

- **P2-4.** socket.io 섹터 브로드캐스트 + 속도 검증 `[BE]`
  - NestJS `world` 게이트웨이(`apps/api/src/world/world.gateway.ts`) — 액세스 토큰으로 접속 인증, 500m 섹터(경계 50m 이내면 인접 섹터 포함) 룸 구독, 200ms(5Hz)마다 섹터별 위경도 위치 묶음 브로드캐스트(2명 이상인 섹터만), 30초 무갱신 위치 상태 정리(소켓 유지)
  - 섹터 계산(`shared/world/sector.ts`)과 이벤트 계약(`shared/world/contract.ts`)을 단일 소스로 두고 프론트·백엔드가 재노출한다. 서버 속도 검증은 같은 파일의 haversine 거리를 쓰고, 클라이언트 사전 검증은 cheap-ruler로 따로 계산한다
  - 서버에서 30km/h 초과 이동 드롭, 클라이언트는 전송 전 같은 기준으로 사전 검증(`lib/geo/validator.ts`)하고 0.3m 미만 이동은 전송 생략
  - 위치·채팅은 DB에 저장하지 않는 휘발성 브로드캐스트. 채팅은 섹터 즉시 방송(200자)이며 입력·표시 UI는 Phase 5
  - 브라우저는 `NEXT_PUBLIC_WS_URL`로 socket.io 직접 접속 (`lib/realtime/world.ts`)
  - 검증
    - 여러 브라우저 창에서 상대 위치 지연 500ms 이하 동기화
    - 시속 30km 초과 패킷 서버 드롭 확인

**완료 기준**
- [x] 루트 3D 씬 로딩·인트로 정상 동작
- [x] 여러 브라우저 창에서 각자 캐릭터를 이동할 때 상대 위치가 지연 500ms 이하로 동기화
- [x] 속도 초과 패킷 서버 드롭 확인

---

## Phase 3 — LiveKit 공간 음성

> 대시보드 월드에서 가까운 유저의 목소리가 그 방향·거리에서 들리는 공간 음성.

- **P3-1.** LiveKit 룸 토큰 발급 `[BE]`
  - NestJS `voice` 모듈이 `livekit-server-sdk`로 룸 토큰 발급 ([ADR 003](./adr/003-livekit-cloud-sfu.md)) — 액세스 토큰 필수, 룸 이름 `voice-sector-{x}-{y}` 형식 검증, identity는 유저 id, TTL 1시간
  - `POST /api/voice/token` 프록시 경유
  - 검증
    - 토큰 발급 API 호출 성공

- **P3-2.** 섹터 음성 룸 + 거리 기반 구독 `[FE]`
  - 대시보드 월드 진입·섹터 이동 시 해당 섹터 룸(`voice-sector-{x}-{y}`)에 자동 조인하고 이전 룸은 disconnect (`lib/voice/livekit.ts`)
  - 위치를 실제로 전송한 틱마다 40m 이내 거리순 상위 8명만 오디오 구독, 나머지는 구독 해제(`autoSubscribe: false`)
  - HRTF PannerNode 방위 패닝 + 30m까지 풀볼륨·30~40m 선형 감쇠 (`lib/voice/spatial-audio.ts`)
  - 마이크 옵트인(`enableMic`, 거부 시 수신 전용)·AudioContext 재개(`resumeAudio`) 메서드를 호출하는 UI 연결
  - 검증
    - 같은 섹터의 두 기기가 30m 이내에서 서로의 음성을 들음
    - 40m 이탈 시 오디오 구독 해제

**완료 기준**
- [ ] 마이크 옵트인 후 같은 섹터의 두 기기가 30m 이내에서 서로의 음성을 들음
- [ ] 40m 이탈 시 오디오 구독 해제

---

## Phase 4 — 인앱 결제 + 아바타 발급 + 가시거리 라이선스

> 원화 결제로 유니크 아바타를 발급하고 가시거리 라이선스를 영구 확장한다.

- **P4-1.** PG 결제 웹훅 연동 `[BE]`
  - NestJS `billing` 모듈 `POST /billing/webhook` ([ADR 004](./adr/004-direct-krw-payment.md)) — raw body HMAC-SHA256 서명 검증(`x-pg-signature`, `PG_WEBHOOK_SECRET`), 주문 금액은 서버가 정한다
  - 멱등성은 DB 제약으로 보장 (`orders_pg_approval_uniq`)
  - 상점 결제창에 토스페이먼츠 / 카카오페이 연동 — 현재 상점은 주문서(`PENDING`)만 발행하고, 결제 승인은 웹훅으로 반영한다
  - 지급 최종 실패 시 PG사 자동 취소 + CS 로그 적재
  - 검증
    - 결제 승인 후 아바타 발급까지 5초 이내
    - 지급 최종 실패 시 3초 이내 자동 취소

- **P4-2.** 아바타 발급 파이프라인 `[BE]`
  - 발급 워커(`apps/api/src/billing/fulfillment.worker.ts`) — 2초마다 지급 대기 주문을 `FOR UPDATE SKIP LOCKED`로 집어 아바타/라이선스 발급(잠금은 조회 트랜잭션 동안만 유지, 중복은 UNIQUE·`GREATEST`로 흡수), 실패 건은 다음 폴링에서 재처리
  - `characters` 테이블 `appearance_hash` UNIQUE로 외형 충돌 방지 — 충돌 시 외형을 다시 뽑는다(최대 8회), 시리얼 `OW-` + 8자리
  - 묶음 상품(아바타 10종) 멱등 발급 (`characters_order_item_uniq`)
  - 발급 대기 중 "주문 제작 중" 로딩 연출 — 예정(상점은 주문 옆에 "지급 대기"만 표시)
  - 검증
    - 동일 `appearance_hash` 중복 발급 차단 확인
    - 웹훅 중복 수신 시 단 1회만 발급 확인

- **P4-3.** 가시거리 라이선스 + 상점 UI `[FE][BE]`
  - `user_licenses.visibility_radius_m`(기본 25m) — 라이선스 상품(100m·300m) 지급 시 `GREATEST`로 올린다(낮은 등급을 나중에 사도 줄지 않음)
  - `app/(game)/store` — 상품 카드(아바타 2,200원·가시거리 100m 4,900원·300m 9,900원·아바타 10종 19,800원)·주문, 내 아바타·가시거리·주문 내역 표시
  - `GET /api/me/characters`, `GET /api/me/license`, `GET /api/billing/products`, `GET·POST /api/billing/orders`
  - 검증
    - 라이선스 지급 후 `GET /api/me/license` 반경 갱신 확인

**완료 기준**
- [x] 결제 승인 후 아바타 발급까지 5초 이내
- [x] 동일 `appearance_hash` 중복 발급 차단
- [ ] 상점 결제창 PG 연동(토스페이먼츠·카카오페이)
- [ ] 지급 최종 실패 시 3초 이내 자동 취소
- [ ] 발급 대기 중 "주문 제작 중" 연출

---

## Phase 5 — B2B 스폰서십 광고 + 씬 뷰 디스턴스 연동 + 채팅 UI

> 광고주가 셀프 서비스로 스폰서 랜드마크(위경도 Point)에 브랜드 텍스처를 매핑하고 노출 통계를 확인한다. 랜드마크 좌표는 5시 GIS 미니맵의 마커 레이어에도 표시된다. 라이선스 가시거리를 월드 렌더링에 적용하고, 대시보드 월드에 채팅 UI를 붙인다.

- **P5-1.** PostGIS 공간 쿼리 `[DB]`
  - `ST_DWithin` 기반 반경 내 활성 스폰서 랜드마크 조회 함수 `nearby_sponsor_buildings(lng, lat, radius_m = 500)` (`geom::geography` 캐스팅, 마이그레이션 `0005`)
  - GiST 인덱스(`idx_sponsor_buildings_geom`) 기반 성능 튜닝 ([ADR 005](./adr/005-postgis-gist-index.md))
  - 검증
    - 10개 스폰서 랜드마크 감지 쿼리가 10ms 이하

- **P5-2.** 광고주 포탈 `[FE][BE]`
  - 광고주(`role: advertiser`) 포탈 — 미니맵 좌표 선택 + 이미지 업로드 + 원화 결제
  - `sponsor_buildings` 테넌시 격리 RLS 정책 (광고주 간 데이터 격리)
  - 검증
    - 광고주 포탈 정상 접근 및 랜드마크 좌표 등록 성공
    - 타 광고주 데이터 접근 차단(RLS) 확인

- **P5-3.** 브랜드 텍스처 매핑 + 유효 노출 `[3D][BE]`
  - Three.js TextureLoader로 월드 내 랜드마크 간판 UV에 브랜드 로고 실시간 매핑 + 미니맵 좌표 마커 표시
  - 유효 노출 카운팅 (1초 이상 뷰포트 내 완전 진입 시만 `ad_impressions` 기록)
  - 무료 유저 씬 뷰 디스턴스 경계(35m)에 스폰서 랜드마크 실루엣 + Glow 효과
  - 검증
    - 브랜드 텍스처 월드 내 정상 렌더링 확인
    - 1초 미만 노출은 기록 제외 확인

- **P5-4.** pg_cron 광고 자동화 `[DB]`
  - pg_cron `activate-ads` — 매일 15:00 UTC(=00:00 KST) 시작일 구좌 활성·종료 다음 날 비활성 (마이그레이션 `0003`)
  - 비활성 구좌는 `default_texture_url`로 표시
  - 검증
    - 광고주 등록 완료 후 익일 새벽 스케줄러 실행 시 랜드마크 텍스처 자동 교체

- **P5-5.** 씬 뷰 디스턴스 연동 `[3D][FE]`
  - 라이선스 가시거리(`GET /api/me/license`)를 월드 렌더링 반경에 적용 — `lib/three/fog.ts`(CSS radial-gradient 비네트, `--fog-radius`) 연결
  - 결제 완료 시 반경 실시간 확장 연출 (0.1초 Transition)
  - 검증
    - 라이선스 지급 후 씬 뷰 디스턴스 즉시 확장 확인

- **P5-6.** 대시보드 월드 채팅 UI `[FE]`
  - 채팅 입력창과 말풍선 표시 — `Hud`의 `onChat` 입력과 `WorldCanvas`의 채팅 수신 핸들러를 연결한다(섹터 채팅 방송은 Phase 2에서 구현)
  - 검증
    - 같은 섹터 두 창에서 채팅 말풍선 표시 확인

**완료 기준**
- [ ] 10개 스폰서 랜드마크 감지 쿼리가 10ms 이하
- [ ] 광고주 등록 완료 후 익일 새벽 스케줄러 실행 시 랜드마크 텍스처 자동 교체
- [ ] 광고주 간 데이터 테넌시 격리(RLS) 확인
- [ ] 라이선스 지급 후 씬 뷰 디스턴스 즉시 확장
- [ ] 같은 섹터 유저 간 채팅 말풍선 표시

---

## Phase 6 — 상용화 및 프로덕션 안정화

> 실제 서비스 런칭을 위한 보안 강화, 부하 테스트, 비용 관리.

- **P6-1.** 보안 강화 `[Infra]`
  - Mapbox 토큰 도메인 락 + 모바일 Bundle ID 제한 적용 (미니맵·대시보드 월드)
  - RLS 정책 전수 점검 (`app.user_id`/`app_api` 롤/트랜잭션 범위 `SET LOCAL`)
  - 안전 경고 팝업 법적 면책 검토
  - 검증
    - 허용 도메인 외 Mapbox 토큰 차단 확인
    - 전역 `SET`(트랜잭션 밖 컨텍스트) 부재 확인

- **P6-2.** 부하 테스트 `[Infra]`
  - 동접 200명 기준 부하 테스트 (socket.io 섹터 브로드캐스트 + PostGIS 공간 쿼리)
  - 심야 시간대 (23:00~05:00) 실외 GPS 이동·위치 표시 자동 잠금
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

> 현재 구조는 "루트 Next.js 앱 + `apps/api` NestJS" 코로케이션이며, 공개 진입점은 루트 3D 씬이다(모든 페이지 라우트 공개). 아래는 향후 진행 방향으로, 현재 구조로 단정하지 않는다.

- **SaaS 우선 완성** — 인증·실시간·음성·결제·발급 등 서비스 백엔드(SaaS)를 먼저 완성하는 것을 우선순위로 둔다.
- **인증 게이팅 연결** — SaaS 완성 후 웹사이트를 공개할 때 `middleware.ts` matcher에 `applyAuthMiddleware`(`lib/auth/middleware.ts`)를 연결해 `/dashboard`·`/store`·`/admin`을 보호한다.
- **마케팅 웹사이트 별도 앱** — 서비스 소개/전환용 마케팅 웹사이트는 SaaS 완성 이후 별도 앱으로 제작한다.
- **모노레포 전환** — pnpm workspaces + Turborepo 기반 모노레포로 정리하는 것을 지향한다.
  ```
  apps/
  ├── app/    ← 게임 클라이언트 (Next.js)
  ├── web/    ← 마케팅 웹사이트 (추후 제작)
  └── api/    ← NestJS API 서버
  packages/   ← 공용 타입·UI·설정 등 공유 패키지
  ```
