# 프로젝트 구조

```
project/
├── app/                          ← Next.js App Router
│   ├── village/                  ← 마을 씬 (page, scene, thirdPerson, rampShader, shadows, sea, birds, postprocess, touchCircles, audio, remotes, kidAnimation, setup, noise)
│   ├── neighborhood/             ← 내 주변(베타) (page, scene, stream, ground, groundSource, ground.worker — 실제 길을 마을 씬 화풍으로, 걷는 만큼 이어 깔기)
│   ├── preview/                  ← 에셋 미리보기 (page, scene — ref-assets 캐릭터·소품, 개발용)
│   ├── api/health/route.ts       ← 헬스 체크 (Next.js 자체 응답)
│   ├── globals.css
│   ├── icon.svg
│   ├── layout.tsx                ← 루트 레이아웃 (Nunito·JetBrains Mono 폰트, PageTransition)
│   └── page.tsx                  ← 선택 페이지 (타이틀 화면 — 마을·내 주변·에셋 미리보기 버튼)
│
├── components/                   ← 공유 React 컴포넌트
│   ├── world/
│   │   ├── PaperMap.tsx          ← 펼침 지도 (마을 씬·내 주변, 독립 Mapbox GL 캔버스)
│   │   └── paperMapStyle.ts      ← 펼침 지도 스타일(Streets v8·지형 음영)과 무늬
│   ├── transition/               ← 페이지 전환 연출
│   │   ├── Loader.tsx            ← 로더(스피너·안내 한 줄) — 모든 로딩 화면
│   │   └── PageTransition.tsx    ← 링크 이동 때 전체 화면 로더
│   ├── hud/                      ← 이동·채팅 입력 UI 부품 (어느 화면에도 연결하지 않음)
│   │   ├── DirectionPad.tsx      ← 방향키 UI
│   │   ├── Joystick.tsx          ← 가상 조이스틱 UI
│   │   └── ChatInput.tsx         ← 채팅 입력 UI
│   ├── avatar/
│   │   └── AvatarCard.tsx        ← 아바타 미리보기 카드 (페이지에 연결되지 않음)
│   └── ui/                       ← 공통 UI (Button, Card, Toast)
│
├── lib/                          ← 클라이언트 공유 로직
│   ├── routes.ts                 ← SCENE_ROUTES — 선택 페이지가 보여 주는 경로 목록
│   ├── geo/
│   │   ├── gps.ts                ← GPS 추적기·상태 (씬·펼침 지도가 함께 쓰는 watchPosition, 내 주변 시작 위치 대기)
│   │   ├── gpsMessages.ts        ← GPS 상태별 안내 문구·기기 판별 (지도 쪽지, 내 주변 대기 화면·알림)
│   │   ├── localFrame.ts         ← 위경도 ↔ 원점 기준 로컬 미터 (내 주변(베타))
│   │   └── vectorTiles.ts        ← OpenStreetMap 벡터 타일(OpenFreeMap)에서 길 읽기
│   ├── three/
│   │   ├── binLoader.ts          ← ref-assets .bin(Draco) 로더 + 스킨·애니메이션·인스턴스 LOD 헬퍼
│   │   ├── character.ts          ← kid 스킨드 캐릭터(idle/run) + 절차적 폴백 메시 (에셋 미리보기)
│   │   └── fog.ts                ← Fog of War CSS 비네트 반경 헬퍼 (어느 화면에도 연결하지 않음)
│   ├── realtime/
│   │   └── scene.ts              ← socket.io 익명 연결 (마을 씬 `/scene`·내 주변 `/neighborhood`)
│   └── utils.ts                  ← `cn()` — clsx + 커스텀 토큰을 아는 tailwind-merge
│
├── apps/api/src/                 ← NestJS API 서버
│   ├── main.ts                   ← 부트스트랩 (raw body 보존 · CORS · 포트)
│   ├── app.module.ts
│   ├── health.controller.ts
│   ├── database/                 ← pg Pool + RLS 컨텍스트 (module, service)
│   ├── users/                    ← me.controller, user.entity, users.service, module
│   ├── auth/                     ← controller, service, types, module (decorator/ dto/ guard/ oauth/)
│   ├── world/                    ← world.gateway (대시보드 월드 섹터 중계, socket.io), sector.ts, module
│   ├── scene/                    ← scene.gateway (마을 씬 익명 방 중계) · neighborhood.gateway (내 주변 가까운 사람 중계) · relay (함께 쓰는 검증), module
│   ├── voice/                    ← voice.controller, module (LiveKit 토큰 발급)
│   ├── billing/                  ← controller, service, fulfillment.service, fulfillment.worker, module
│   └── avatars/                  ← service, module (외형 조합 · 고유 시리얼 발급)
│
├── shared/world/                 ← 프론트·백엔드 공유 단일 소스(SSOT) — 대시보드 월드
│   ├── contract.ts               ← 월드 소켓 이벤트 계약 (socket.io 제네릭 타입)
│   └── sector.ts                 ← 섹터 격자(500m)·거리·이동 검증 계산
├── shared/scene/
│   └── contract.ts               ← 익명 멀티플레이 소켓 이벤트 계약 (마을 씬·내 주변, socket.io 제네릭 타입)
│
├── supabase/migrations/          ← PostgreSQL 마이그레이션 SQL 0001~0010
│                                    (PostGIS, pg_cron, pgcrypto, citext)
├── supabase/functions/           ← Supabase Edge Function (livekit-token, spatial-query) — 앱에서 호출하지 않음
│
├── public/
│   ├── landing/                  ← 랜딩 배경 이미지 (앱 코드에서 참조하지 않음)
│   │   ├── hero.jpg
│   │   ├── explore.jpg
│   │   ├── voice.jpg
│   │   └── social.jpg
│   └── ref-assets/               ← 마을 씬·내 주변·에셋 미리보기가 쓰는 에셋 (kid 캐릭터 포함)
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

제품 진입은 선택 페이지(`/`)다. `app/page.tsx`가 `lib/routes.ts`의 `SCENE_ROUTES`(`/village`·`/neighborhood`·`/preview`)를
목적지 버튼 3개로 세로로 쌓아 보여 주고, 세 페이지 모두 로그인 없이 동작한다. 마을 씬
(`/village`)은 같은 방 다른 방문자를 익명 소켓(`/scene`)으로 받아 그리고, API 서버에 닿지 못하면 혼자인 채로 돈다.
내 주변(베타)(`/neighborhood`)은 마을 씬 모듈(`app/village/`의 셰이더·조작·그림자·후처리·원격 아이)을 가져다 쓰고,
같은 계약으로 `/neighborhood`에 붙어 반경 200m 사람을 받는다. 두 씬은 펼침 지도(`components/world/PaperMap.tsx`)를
함께 쓰고, 씬마다 GPS 추적기(`lib/geo/gps.ts`) 하나를 씬과 지도가 나눠 쓴다. 페이지 라우트 게이팅은 없어
(`middleware.ts`의 `matcher`가 비어 있음) 모든 페이지가 공개다.

로그인·본인인증·대시보드 월드·상점 화면과 NestJS로 넘기는 BFF 라우트(`/api/auth/*`, `/api/billing/*`, `/api/me/*`,
`/api/voice/token`)는 로드맵에 따라 만든다(예정). 이 화면들이 쓰는 서버 쪽(`auth`·`billing`·`users`·`voice` 모듈,
`world` 게이트웨이)은 API 서버에 있다. 랜딩/마케팅 웹은 추후 별도 앱으로 분리한다(로드맵 참고).

현재 구조는 루트 Next.js 앱과 `apps/api` NestJS를 한 저장소에 코로케이션한 형태다. 대시보드 월드의 섹터 계산과
소켓 이벤트 계약은 `shared/world/`에 단일 소스로 두고, 백엔드(`apps/api/src/world/`)가 이를 재노출해 쓴다.
익명 멀티플레이 소켓 계약은 `shared/scene/contract.ts` 하나를 프론트(`lib/realtime/scene.ts`)와
백엔드(`apps/api/src/scene/`의 두 게이트웨이)가 직접 import한다.

---

## 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | 선택 페이지 — 여름 오후 풍경 위 제목 "어슬렁"과 세로로 쌓은 목적지 버튼 3개(마을·내 주변·에셋 미리보기, 이름·배지·아이콘은 `PLACES`). Stylish 폰트 파일을 `preload`로 미리 받는다 |
| `lib/routes.ts` | `SCENE_ROUTES`(`/village`, `/neighborhood`, `/preview`) — 선택 페이지만 쓰는 경로 목록(카드 문구 `PLACES`와 타입으로 묶인다) |
| `app/village/scene.tsx` | 마을 씬 — ref-assets 로드·씬 조립·렌더 루프, 우상단 HUD(사운드·옷 색·지도, 위치를 못 잡으면 지도 버튼 구석에 "!")와 단축키(M·Esc·Ctrl+M), 펼침 지도 마운트(펼친 동안 캐릭터 조작을 끈다), GPS 추적기(이미 허용된 사이트면 씬 시작 때 바로, 아니면 지도를 처음 펼칠 때 권한을 묻는다) |
| `app/village/thirdPerson.ts` | 마을 씬 3인칭 조작(키보드·마우스·터치·게임패드)·캡슐 충돌·카메라 리그와 화면 비율 반응형 구도(`framingFor`) ([ADR 007](../adr/007-quarter-view-camera-lock.md)) |
| `app/village/shadows.ts` | 동적 그림자(시선 앞 ±12m) + 정적 그림자(CSM) 굽기 |
| `app/village/sea.ts` · `birds.ts` · `postprocess.ts` · `touchCircles.ts` | 하늘을 비추는 바다, 갈매기 무리 비행, 최종 화면 패스(LUT·인트로), 터치 원 UI |
| `app/village/remotes.ts` · `kidAnimation.ts` | 같은 방 다른 아이들 — 받은 상태를 2단 보간해 그리고 등장·퇴장 크기 연출. 로컬·원격 아이가 함께 쓰는 idle·run·air·bored 가중치 규칙 |
| `app/neighborhood/stream.ts` | 걷는 만큼 이어지는 바닥 — 256m 구역을 캐릭터 둘레 3×3으로 깔고 멀어진 구역은 치운다, 워커가 그린 마스크로 텍스처·메시 생성, 잔디 받침 바닥 |
| `app/neighborhood/ground.worker.ts` · `groundSource.ts` | 워커에서 z14 타일 받기·해석(12장 캐시)과 구역 마스크 그리기(OffscreenCanvas) — 워커가 없으면 같은 코드를 메인 스레드에서 |
| `app/neighborhood/scene.tsx` · `ground.ts` | 내 주변(베타) — 위치를 받을 때까지 대기 화면에서 기다렸다가(`waitForStartFix`) 그 주변 실제 길(OpenStreetMap)을 마을 씬 지형 셰이더 마스크로 그려 1m = 1m로 걷는다. 휴대폰은 ±50m 안 GPS를 따라 걷는다. 우상단 지도 버튼 하나(M·Esc), 펼침 지도의 '나'는 캐릭터 자리와 화면이 보는 방향(`MapTrack`)이다. 반경 200m 사람이 실제 자리에 보인다. `ground.ts`는 도로 폭 규칙·타일 경계에 맞춘 점선 박자·마스크 그리기 |
| `app/preview/scene.tsx` | 에셋 미리보기 — ref-assets 캐릭터·소품을 지도 없이 띄워 크기·본·애니메이션·인스턴스·LOD 규격을 확인한다(개발용). 자체 렌더러 + OrbitControls, 세로로 긴 화면은 `framingFor`로 화각을 넓힌다 |
| `lib/geo/vectorTiles.ts` · `localFrame.ts` | OpenFreeMap z14 타일의 `transportation` 레이어 읽기(땅 위의 길만) · 위경도 ↔ 로컬 미터 변환 |
| `lib/geo/gps.ts` | GPS 추적기(`createGpsTracker`) — `watchPosition` 하나를 씬과 펼침 지도가 나눠 쓰고, 권한·오류·정확도를 상태 하나로 묶는다. `waitForStartFix`(내 주변 시작 위치)·`isWalkableFix`(±50m)·`useGpsSnapshot`·`formatAccuracy` |
| `lib/geo/gpsMessages.ts` | GPS 상태별 안내 문구(해요체)와 기기 판별(iOS·Android·Windows·Mac, 삼성 인터넷, 앱 속 브라우저) — `gpsNote`(지도 쪽지·도장·버튼)·`startWaitNote`(내 주변 대기 화면)·`walkNote`(내 주변 위쪽 알림) |
| `components/world/PaperMap.tsx` | 펼침 지도 — 씬과 분리된 독립 Mapbox GL 캔버스([ADR 001](../adr/001-webgl-context-sharing.md)). 씬이 시작되면 한 번 만들고 접혀 있는 동안은 숨겨 둔다. 종이 폭에 따라 3단·반 접기·바로 펼침, GPS 상태 쪽지·도장·정확도 원·'나' 표시(DOM 마커). `MapIcon`·`GpsBadge`·`useMapHotkey`(M·Esc)·`MapTrack`도 내보낸다 |
| `components/world/paperMapStyle.ts` | 펼침 지도 스타일 `PAPER_STYLE` — Mapbox Streets v8 + 지형 DEM을 게임 화풍으로 칠한다. 무늬 `PATTERNS`(나무·풀포기·물결)는 `styleimagemissing`에서 캔버스로 그려 넣는다 |
| `lib/realtime/scene.ts` | socket.io 익명 멀티플레이 연결(마을 씬 `/scene`·내 주변 `/neighborhood`) — 35ms마다 바뀐 필드만 전송, 탭 숨김·5분 무변화 시 끊기, 재접속 때 전에 있던 방 요청 |
| `lib/three/fog.ts` | Fog of War CSS 비네트 반경 헬퍼 — 어느 화면에도 연결되어 있지 않다 ([ADR 006](../adr/006-fog-of-war-business-model.md)) |
| `apps/api/src/scene/scene.gateway.ts` | 마을 씬 익명 socket.io 게이트웨이(`/scene`) — 방 배정(20명)·35ms 방 단위 변경분 방송 |
| `apps/api/src/scene/neighborhood.gateway.ts` | 내 주변 익명 socket.io 게이트웨이(`/neighborhood`) — 실제 좌표, 사람마다 반경 200m 가까운 19명 선택·입장 전체 상태·퇴장 `leave` |
| `apps/api/src/scene/relay.ts` | 두 익명 게이트웨이가 함께 쓰는 상태 보관·필드 검증·거리 예산·순간이동·빈도 제한 |
| `shared/scene/contract.ts` | 익명 멀티플레이 소켓 이벤트 이름·페이로드 계약(위치·방향·모션·색 시드)과 월드별 네임스페이스·위치 자리수(`SCENE_WORLDS`) — 프론트·백엔드 socket.io 제네릭 단일 소스 |
| `apps/api/src/world/world.gateway.ts` | 대시보드 월드 socket.io 게이트웨이(`/world`) — 섹터 판정·속도 검증·5Hz 묶음 브로드캐스트 (`shared/world/contract` 제네릭 타입). 붙는 화면은 대시보드 월드와 함께 예정 |
| `shared/world/contract.ts` | 월드 소켓 이벤트 이름·페이로드 계약 — socket.io 제네릭 단일 소스 |
| `shared/world/sector.ts` | 섹터 격자(500m)·거리·이동 속도 검증 계산 — 단일 소스 |
| `apps/api/src/billing/fulfillment.worker.ts` | 결제 완료 주문을 폴링해 아바타·라이선스 발급 |
| `apps/api/src/voice/voice.controller.ts` | LiveKit Cloud 섹터 룸 접속 JWT 토큰 발급 |
| `apps/api/src/database/database.service.ts` | pg Pool + 트랜잭션별 `app.user_id`/`app.user_role` RLS 컨텍스트 주입 |

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [프론트엔드 컨벤션](../frontend/conventions.md)
- [백엔드 컨벤션](../backend/conventions.md)
- [온보딩 — 개발 명령어](../onboarding/commands.md)
