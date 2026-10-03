# 프로젝트 구조

```
project/
├── app/                          ← Next.js App Router — 라우트만 둔다 (page·layout·route)
│   ├── play/page.tsx             ← 플레이 씬 `/play` — 화면은 features/play
│   ├── nearby/page.tsx           ← 내 주변(베타) `/nearby` — 화면은 features/nearby
│   ├── asset-viewer/page.tsx     ← 에셋 미리보기 `/asset-viewer`(개발용) — 화면은 features/asset-viewer
│   ├── api/health/route.ts       ← 헬스 체크 (Next.js 자체 응답)
│   ├── globals.css
│   ├── icon.svg
│   ├── layout.tsx                ← 루트 레이아웃 (Nunito·JetBrains Mono 폰트, PageTransition)
│   └── page.tsx                  ← 선택 페이지 (타이틀 화면 — 플레이·내 주변·에셋 미리보기 버튼)
│
├── features/                     ← 화면별 코드 — 화면끼리는 서로 가져다 쓰지 않는다
│   ├── play/                     ← 플레이 씬 (play-scene, sea, birds, audio)
│   ├── nearby/                   ← 내 주변(베타) (nearby-scene, ground-stream, ground, ground-source, ground.worker — 실제 길을 플레이 씬 화풍으로, 걷는 만큼 이어 깔기)
│   └── asset-viewer/             ← 에셋 미리보기 (asset-viewer — ref-assets 캐릭터·소품, 개발용)
│
├── components/                   ← 여러 화면이 같이 쓰는 React 컴포넌트
│   ├── ui/                       ← 공통 UI (button, card, toast, loader — 로더는 모든 로딩 화면, sound-link — 누르는 순간 오디오를 켜 두는 링크)
│   ├── layout/
│   │   └── page-transition.tsx   ← 링크 이동 때 전체 화면 로더
│   ├── map/
│   │   ├── paper-map.tsx         ← 펼침 지도 (플레이 씬·내 주변, 독립 MapLibre GL 캔버스 — 처음 펼칠 때 만든다)
│   │   └── paper-map-style.ts    ← 펼침 지도 스타일(OpenMapTiles 벡터 타일·지형 음영)과 무늬
│   ├── location/
│   │   └── gps-steps.tsx         ← 위치 설정 경로 안내 (펼침 지도 쪽지·내 주변 대기 화면)
│   ├── hud/                      ← 씬 위에 겹치는 UI 부품
│   │   ├── talk-layer.tsx        ← 만남 대화 화면 — 손가락 표시·원형 메뉴·요청 카드·대화 창·머리 위 말풍선 (플레이 씬)
│   │   ├── direction-pad.tsx     ← 방향키 UI (어느 화면에도 연결하지 않음)
│   │   ├── joystick.tsx          ← 가상 조이스틱 UI (어느 화면에도 연결하지 않음)
│   │   └── chat-input.tsx        ← 채팅 입력 UI (어느 화면에도 연결하지 않음)
│   └── avatar/
│       └── avatar-card.tsx       ← 아바타 미리보기 카드 (페이지에 연결되지 않음)
│
├── lib/                          ← 화면들이 같이 쓰는 로직
│   ├── routes.ts                 ← SCENE_ROUTES — 선택 페이지가 보여 주는 경로 목록
│   ├── audio/
│   │   └── unlock.ts             ← 선택 페이지 '플레이'를 누를 때 켜 두는 오디오 컨텍스트 (플레이 씬이 이어 쓴다)
│   ├── geo/
│   │   ├── gps.ts                ← GPS 추적기·상태 (씬·펼침 지도가 함께 쓰는 watchPosition, 내 주변 시작 위치 대기)
│   │   ├── gps-messages.ts       ← GPS 상태별 안내 문구·기기 판별 (지도 쪽지, 내 주변 대기 화면·알림)
│   │   ├── local-frame.ts        ← 위경도 ↔ 원점 기준 로컬 미터 (내 주변(베타))
│   │   ├── steps.ts              ← 가속도계 발걸음·iOS 동작 권한 (내 주변 탈것 판정)
│   │   └── vector-tiles.ts       ← OpenStreetMap 벡터 타일(OpenFreeMap)에서 길 읽기
│   ├── three/                    ← 3D 엔진 — 플레이 씬·내 주변·에셋 미리보기가 같이 쓴다
│   │   ├── bin-loader.ts         ← ref-assets .bin(Draco) 로더 + 스킨·애니메이션·인스턴스 LOD 헬퍼
│   │   ├── ramp-shader.ts        ← 원작 셰이딩(램프) 재질 — 캐릭터·하늘·지형, LUT
│   │   ├── third-person.ts       ← 3인칭 조작·캡슐 충돌·카메라 리그·반응형 구도(framingFor)
│   │   ├── touch-circles.ts      ← 터치 조작 원 (씬 안 화면 공간 메시)
│   │   ├── shadows.ts            ← 해와 동적 그림자(시선 앞 ±12m)·정적 그림자(CSM) 굽기
│   │   ├── warm-up.ts            ← 로더 뒤 GPU 예열 — 셰이더 나눠 컴파일·텍스처 하나씩 업로드·모든 물체 한 번 그리기·GPU 펜스로 기다리기(플레이 씬·내 주변, 에셋 미리보기는 컴파일만)
│   │   ├── postprocess.ts        ← 최종 화면 패스 (LUT·인트로)
│   │   ├── kid-animation.ts      ← 캐릭터 idle·run·air·bored 가중치 규칙 (내 캐릭터·다른 캐릭터 공통)
│   │   ├── remote-players.ts     ← 함께 보이는 다른 캐릭터들 — 2단 보간·등장·퇴장 크기 연출
│   │   ├── setup.ts              ← 기기(모바일·픽셀 비율)·텍스처 준비
│   │   ├── noise.ts              ← 사인 노이즈
│   │   ├── character.ts          ← kid 스킨드 캐릭터(idle/run) + 절차적 폴백 메시 (에셋 미리보기)
│   │   └── fog.ts                ← Fog of War CSS 비네트 반경 헬퍼 (어느 화면에도 연결하지 않음)
│   ├── realtime/
│   │   ├── relay.ts              ← socket.io 익명 연결 (플레이 씬 `/room`·내 주변 `/proximity`, 만남 대화 이벤트)
│   │   └── talk.ts               ← 만남 대화 상태 — 머리 위 표시·E 키 상대 고르기·머리 위 자리 옮기기·요청·대화 (플레이 씬)
│   └── utils.ts                  ← `cn()` — clsx + 커스텀 토큰을 아는 tailwind-merge
│
├── apps/api/src/                 ← NestJS API 서버 (REST, 9001)
│   ├── main.ts                   ← 부트스트랩 (raw body 보존 · CORS · 포트)
│   ├── app.module.ts
│   ├── health.controller.ts
│   ├── database/                 ← Drizzle 스키마(schema.ts) + pg Pool·RLS 컨텍스트 트랜잭션 (module, service)
│   ├── users/                    ← me.controller, user.entity, users.service, module
│   ├── auth/                     ← controller, service, types, module (decorator/ dto/ guard/ oauth/)
│   ├── billing/                  ← controller, service, fulfillment.service, fulfillment.worker, module
│   └── avatars/                  ← service, module (외형 조합 · 고유 시리얼 발급)
├── apps/api/migrations/          ← PostgreSQL 마이그레이션 SQL 0000~0010 (PostGIS, pg_cron, pgcrypto, citext · 0000은 auth.users 스텁) · meta/는 drizzle-kit 스냅숏
├── apps/api/test/                ← DB 통합 테스트 (Vitest + Testcontainers, db.Dockerfile = PostgreSQL 16 + PostGIS + pg_cron)
├── apps/api/drizzle.config.ts    ← drizzle-kit 설정 (schema.ts → migrations/ 다음 번호 SQL)
│
├── apps/realtime/                ← NestJS 실시간 서버 (socket.io, 9002, DB 없음)
│   ├── src/
│   │   ├── main.ts               ← 부트스트랩 (socket.io CORS 어댑터 · 포트)
│   │   ├── app.module.ts
│   │   ├── health.controller.ts
│   │   ├── auth/access-token.ts  ← `/sector` 접속 토큰 검증 (JWT_ACCESS_SECRET, DB 조회 없음)
│   │   ├── room/                 ← room.gateway (방 중계 — 정원 20명 방·만남 대화, 플레이 씬), module
│   │   ├── proximity/            ← proximity.gateway (근접 중계 — 반경 200m 가까운 19명, 내 주변), module
│   │   ├── relay/relay.ts        ← 방·근접 중계가 함께 쓰는 상태 보관·검증
│   │   ├── relay/talk.ts         ← 만남 대화 판정 — 요청·수락·쿨다운·글 검증·끝내기 (방 게이트웨이가 쓴다)
│   │   └── sector/               ← sector.gateway (섹터 중계 — 500m 격자 칸, 맵), grid.ts, module
│   ├── Dockerfile                ← 빌드 컨텍스트는 저장소 루트 (shared/ 함께 컴파일)
│   └── Dockerfile.dockerignore   ← 이 Dockerfile 전용 — apps/realtime·shared만 보낸다
│
├── shared/sector/                ← 프론트·실시간 서버 공유 단일 소스(SSOT) — 섹터 중계(맵)
│   ├── contract.ts               ← 섹터 중계 소켓 이벤트 계약 (socket.io 제네릭 타입)
│   └── grid.ts                   ← 섹터 격자(500m)·거리·이동 검증 계산
├── shared/relay/
│   └── contract.ts               ← 익명 중계 소켓 이벤트 계약 (방 — 플레이 씬, 근접 — 내 주변, socket.io 제네릭 타입)·만남 대화 이벤트와 수치(`TALK`)
│
├── public/
│   ├── maplibre/                 ← MapLibre 워커 복사본 (scripts/copy-maplibre-worker.mjs가 만든다, 저장소에 두지 않음)
│   ├── fonts/                    ← 첫 화면 글자 전용 작은 폰트 (stylish-home·pretendard-home — 선택 페이지 버튼, stylish-loader — 로더 첫 줄)
│   ├── landing/                  ← 랜딩 배경 이미지 (앱 코드에서 참조하지 않음)
│   │   ├── hero.jpg
│   │   ├── explore.jpg
│   │   └── social.jpg
│   └── ref-assets/               ← 플레이 씬·내 주변·에셋 미리보기가 쓰는 에셋 (kid 캐릭터 포함)
│       ├── geometries/           ← .bin 지오메트리·본·애니메이션·인스턴스·충돌 메시
│       ├── images/               ← 텍스처(PNG·KTX2), LUT, 인트로 전환 이미지
│       ├── audio/                ← 배경음·효과음 (mp3)
│       ├── fonts/                ← Stylish
│       ├── libs/                 ← draco·basis 디코더
│       └── MANIFEST.json
│
├── docs/                         ← 이 문서 허브
├── scripts/
│   └── copy-maplibre-worker.mjs  ← MapLibre 워커·shared 파일을 public/maplibre에 복사 (npm run dev·build 전에 돈다)
├── Dockerfile                    ← 프론트 멀티스테이지 빌드 (builder / runner)
├── docker-compose.yml            ← app(프론트 프로덕션 빌드, standalone) + realtime(실시간 서버) — app이 depends_on으로 함께 띄운다
├── middleware.ts                 ← Next.js 전역 미들웨어 (matcher가 비어 있어 실행되지 않음)
├── next.config.ts
├── .env.example                  ← 프론트엔드 환경변수 템플릿
├── apps/api/.env.example         ← API 서버 환경변수 템플릿
├── apps/realtime/.env.example    ← 실시간 서버 환경변수 템플릿 (없어도 기본값으로 뜬다)
└── package.json
```

제품 진입은 선택 페이지(`/`)다. `app/page.tsx`가 `lib/routes.ts`의 `SCENE_ROUTES`(`/play`·`/nearby`·`/asset-viewer`)를
목적지 버튼 3개로 세로로 쌓아 보여 주고, 세 페이지 모두 로그인 없이 동작한다. 플레이 씬
(`/play`)은 같은 방 다른 방문자를 익명 소켓(`/room`)으로 받아 그리고, 가까이 마주친 사람과는 같은 소켓으로 만남 대화를
나누며(`components/hud/talk-layer.tsx`·`lib/realtime/talk.ts`), 실시간 서버에 닿지 못하면 혼자인 채로 돈다.
내 주변(베타)(`/nearby`)은 공유 3D 엔진(`lib/three/`의 셰이더·조작·그림자·후처리·원격 캐릭터)을 플레이 씬과 함께 쓰고,
같은 계약으로 `/proximity`에 붙어 반경 200m 사람을 받는다. 두 씬은 펼침 지도(`components/map/paper-map.tsx`)를
함께 쓰고, 씬마다 GPS 추적기(`lib/geo/gps.ts`) 하나를 씬과 지도가 나눠 쓴다. 페이지 라우트 게이팅은 없어
(`middleware.ts`의 `matcher`가 비어 있음) 모든 페이지가 공개다.

로그인·본인인증·맵·상점 화면과 NestJS로 넘기는 BFF 라우트(`/api/auth/*`, `/api/billing/*`, `/api/me/*`)는
로드맵에 따라 만든다(예정). 이 화면들이 쓰는 서버 쪽은 `auth`·`billing`·`users` 모듈이
API 서버에, `sector` 게이트웨이가 실시간 서버에 있다. 랜딩/마케팅 웹은 추후 별도 앱으로 분리한다(로드맵 참고).

현재 구조는 루트 Next.js 앱과 `apps/api`(REST)·`apps/realtime`(socket.io) NestJS를 한 저장소에 코로케이션한 형태다
([ADR 007](../adr/007-realtime-server-split.md)). 워크스페이스 도구 없이 패키지마다 따로 설치하고, 두 서버는 서로 부르지 않는다.
맵의 섹터 계산과 소켓 이벤트 계약은 `shared/sector/`에 단일 소스로 두고, 실시간 서버(`apps/realtime/src/sector/`)가
이를 재노출해 쓴다. 익명 멀티플레이 소켓 계약은 `shared/relay/contract.ts` 하나를 프론트(`lib/realtime/relay.ts`·`talk.ts`)와
실시간 서버(`apps/realtime/src/room/`·`proximity/`의 두 게이트웨이, 만남 대화 판정 `relay/talk.ts`)가 직접 import하고, 만남 대화의
거리·시간·글자 수(`TALK`)도 이 파일 하나에 둔다. API 서버는 `shared/`를 쓰지 않는다.
실시간 서버의 폴더·네임스페이스는 화면 이름 대신 받는 사람을 고르는 방식(방·근접·섹터)으로 부른다([ADR 008](../adr/008-interest-management-naming.md)).
웹은 `app/`에 라우트만 두고, 화면별 코드는 `features/`, 여러 화면이 같이 쓰는 코드는 `components/`·`lib/`에 두며, 파일 이름은 kebab-case다([ADR 009](../adr/009-web-structure-and-naming.md)).

---

## 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | 선택 페이지 — 여름 오후 풍경 위 제목 "Dumb Dumb"과 세로로 쌓은 목적지 버튼 3개(플레이·내 주변·에셋 미리보기, 이름·배지·아이콘은 `PLACES`). 제목은 Luckiest Guy(`next/font/google`), 버튼 이름·배지는 쓰는 글자만 담은 `public/fonts/stylish-home.woff2`·`pretendard-home.woff2`(4KB·2KB)를 `preload`로 먼저 받아 그리고, 펼침 지도가 쓸 전체 Stylish는 낮은 우선순위로 미리 받는다. '플레이' 버튼은 `SoundLink`라 누르는 순간 오디오를 켜 둔다 |
| `components/ui/sound-link.tsx` | 소리가 나는 화면으로 가는 링크(`next/link`) — 누르기 시작할 때(`pointerdown`)와 클릭 때 `unlockAudio()`로 오디오를 켜 두어 그 화면이 첫 탭을 기다리지 않고 소리를 낸다(컨텍스트를 만드는 70~90ms는 누르는 동안 치른다) |
| `lib/audio/unlock.ts` | 미리 켜 둔 오디오 컨텍스트 — `unlockAudio()`(탭·클릭 처리 안에서 컨텍스트를 켜고 1샘플 무음을 틀어 iOS에서도 연다)·`unlockedAudio()`(플레이 씬 오디오가 three 공용 컨텍스트로 이어 쓴다) |
| `lib/routes.ts` | `SCENE_ROUTES`(`/play`, `/nearby`, `/asset-viewer`) — 선택 페이지만 쓰는 경로 목록(카드 문구 `PLACES`와 타입으로 묶인다) |
| `features/play/play-scene.tsx` | 플레이 씬 — ref-assets 로드·씬 조립·렌더 루프, 우상단 HUD(사운드·옷 색·지도·말 걸기 받기, 위치를 못 잡으면 지도 버튼 구석에 "!")와 단축키(M·Esc·Ctrl+M), 펼침 지도 마운트(지도가 다 접혀 배경이 걷힐 때까지 캐릭터 조작을 끈다), 만남 대화 화면 마운트(렌더 루프가 `talk.frame()`을 부르고, 입력칸에 쓰는 동안 캐릭터 조작을 끈다), GPS 추적기(이미 허용된 사이트면 씬 시작 때 바로, 아니면 지도를 처음 펼칠 때 권한을 묻는다) |
| `lib/three/third-person.ts` | 플레이 씬 3인칭 조작(키보드·마우스·터치·게임패드)·캡슐 충돌·카메라 리그와 화면 비율 반응형 구도(`framingFor`) ([ADR 006](../adr/006-quarter-view-camera-lock.md)) |
| `lib/three/shadows.ts` | 동적 그림자(시선 앞 ±12m) + 정적 그림자(CSM, 4096²) 굽기 — 깊이 재질을 먼저 나눠 컴파일하고 1024² 조각마다 GPU가 굽기를 마칠 때까지 기다린다. 동적 그림자 깊이 셰이더 미리 컴파일(`compileShadowDepth`) |
| `lib/three/warm-up.ts` | 로더 뒤 GPU 예열 — 물체마다 병렬 컴파일(새 프로그램마다 한 프레임 쉰다, 그릴 타깃 기준)·후처리 재질 컴파일·텍스처 하나씩 업로드·모든 물체를 작은 타깃에 한 번씩 그리기(`drawAllGradually` — 숨긴 LOD·먼 묶음의 버퍼·VAO까지), GPU가 앞선 일을 마칠 때까지 펜스로 기다리기(`settle`) |
| `features/play/sea.ts` · `birds.ts` | 하늘을 비추는 바다, 갈매기 무리 비행 |
| `lib/three/postprocess.ts` · `touch-circles.ts` | 최종 화면 패스(LUT·인트로), 터치 원 UI |
| `lib/three/remote-players.ts` · `kid-animation.ts` | 같은 방 다른 캐릭터들 — 받은 상태를 2단 보간해 그리고 등장·퇴장 크기 연출, 만남 대화가 거리·머리 위 자리를 재는 발 위치(`positions()`, 사라지는 중인 캐릭터는 뺀다). 로컬·원격 캐릭터가 함께 쓰는 idle·run·air·bored 가중치 규칙 |
| `features/nearby/ground-stream.ts` | 걷는 만큼 이어지는 바닥 — 256m 구역을 캐릭터 둘레 3×3으로 깔고 멀어진 구역은 치운다, 워커가 그린 마스크로 텍스처·메시 생성, 잔디 받침 바닥, 차도를 피해 설 곳 찾기(`nearestWalk`) |
| `features/nearby/ground.worker.ts` · `ground-source.ts` | 워커에서 z14 타일 받기·해석(12장 캐시)과 구역 마스크 그리기(OffscreenCanvas) — 워커가 없으면 같은 코드를 메인 스레드에서 |
| `features/nearby/nearby-scene.tsx` · `ground.ts` | 내 주변(베타) — 위치를 받을 때까지 대기 화면에서 기다렸다가(`waitForStartFix`) 그 주변 실제 길(OpenStreetMap)을 플레이 씬 지형 셰이더 마스크로 그려 1m = 1m로 걷는다. 휴대폰은 터치 조작 없이 ±50m 안 GPS(흔들림을 칼만 필터로 거른 자리, 차도 위면 가장 가까운 인도)를 따라 걷고, 걸음 없이 탈것 속도면(발걸음 + GPS 속도) 선 채로 미끄러진다. iOS는 시작 전 권한 단계의 '허용'으로 동작·위치 권한을 받는다. 우상단 지도 버튼 하나(M·Esc), 펼침 지도의 '나'는 캐릭터 자리와 화면이 보는 방향(`MapTrack`)이다. 반경 200m 사람이 실제 자리에 보인다. `ground.ts`는 도로 폭 규칙·타일 경계에 맞춘 점선 박자·마스크 그리기 |
| `features/asset-viewer/asset-viewer.tsx` | 에셋 미리보기 — ref-assets 캐릭터·소품을 지도 없이 띄워 크기·본·애니메이션·인스턴스·LOD 규격을 확인한다(개발용). 자체 렌더러 + OrbitControls, 세로로 긴 화면은 `framingFor`로 화각을 넓힌다 |
| `lib/geo/vector-tiles.ts` · `local-frame.ts` | OpenFreeMap z14 타일의 `transportation` 레이어 읽기(땅 위의 길만) · 위경도 ↔ 로컬 미터 변환 |
| `lib/geo/gps.ts` | GPS 추적기(`createGpsTracker`) — `watchPosition` 하나를 씬과 펼침 지도가 나눠 쓰고, 권한·오류·정확도를 상태 하나로 묶는다. 위치마다 GPS 속도(도플러, 못 재면 null)를 싣는다. `waitForStartFix`(내 주변 시작 위치)·`isWalkableFix`(±50m)·`queryGpsPermission`(묻지 않고 권한 알아보기)·`useGpsSnapshot`·`formatAccuracy` |
| `lib/geo/steps.ts` | 발걸음 — `devicemotion` 가속도로 박자 맞는 걸음을 센다(`createStepTracker`, 브라우저와 떼어 둔 셈은 `createStepCounter`). iOS 동작 권한을 창 없이 알아보고(`queryMotionPermission`) 탭 안에서 묻는다(`requestMotionPermission`) |
| `lib/geo/gps-messages.ts` | GPS 상태별 안내 문구(해요체)와 기기 판별(iOS·Android·Windows·Mac, 삼성 인터넷, 앱 속 브라우저) — `gpsNote`(지도 쪽지·도장·버튼)·`startWaitNote`(내 주변 대기 화면)·`motionAskNote`(내 주변 iOS 권한 단계)·`walkNote`(내 주변 위쪽 알림) |
| `components/map/paper-map.tsx` | 펼침 지도 — 씬과 분리된 독립 MapLibre GL 캔버스([ADR 001](../adr/001-webgl-context-sharing.md)). 처음 펼칠 때 지도 코드(`maplibre-gl`)를 받아 한 번 만들고 접혀 있는 동안은 숨겨 둔다(씬 로더는 지도를 기다리지 않는다). 출처 표기는 처음 펼친 뒤 5초 보여 주고 (i)로 접는다. 종이 폭에 따라 3단·반 접기·바로 펼침, GPS 상태 쪽지·도장·정확도 원·'나' 표시(DOM 마커). `MapIcon`·`GpsBadge`·`useMapHotkey`(M·Esc)·`MapTrack`도 내보낸다 |
| `components/map/paper-map-style.ts` | 펼침 지도 스타일 `PAPER_STYLE` — OpenStreetMap 벡터 타일(OpenFreeMap, OpenMapTiles 스키마) + AWS Terrain Tiles 지형 음영을 게임 화풍으로 칠한다. 무늬 `PATTERNS`(나무·풀포기·물결)는 처음 필요할 때(`setMissingStyleImageResolver`) 캔버스로 그려 넣는다 |
| `lib/realtime/relay.ts` | socket.io 익명 멀티플레이 연결(플레이 씬 `/room`·내 주변 `/proximity`) — 35ms마다 바뀐 필드만 전송, 5분 무변화 시 끊기(탭을 숨겨도 연결을 둔다, 만남 대화가 오가면 바뀐 것으로 친다), 재접속 때 전에 있던 방 요청, 만남 대화 이벤트 송수신(`RelayConnection.talk`) |
| `lib/realtime/talk.ts` | 만남 대화 상태(`createTalk`) — 누른 자리의 캐릭터 찾기(`pick`)와 원형 메뉴 열고 닫기(`select`, 말 걸기 아이콘은 4m 안에서 켜고 4.2m 밖·쿨다운 중에 끔 — 꺼진 아이콘으로 걸면 까닭 한 줄), 4m 안에 들어온 보이는 사람마다 머리 위 표시(`hints` — 4.2m 밖이면 사라지는 중으로 0.2초 남겼다 뺀다, 쉬는 사람은 흐리게)와 그 가운데 가장 가까운 E 키 상대 고르기(기다리던 요청도 4.2m 밖이면 거둠), 머리 위 표시(사람마다 `hintAnchor`)와 자리 4개(메뉴·건 사람 표시·내 말풍선·상대 말풍선)를 매 프레임 translate3d로 옮기기, 서버 이벤트대로 요청·대화·끝을 그리는 스토어(`useSyncExternalStore`), 받기 끄기(`localStorage`)·클라이언트 글 검증 |
| `components/hud/talk-layer.tsx` | 만남 대화 화면 — 머리 위 손가락 표시(누르면 원형 메뉴, E 키)·원형 메뉴(말 걸기 아이콘, 멀면 옅은 색·쉬는 중 쿨다운 덮개)·건 사람 "!"·요청 카드(15초 타이머)·대화 창(로그·빠른 문구·입력)·말풍선·알림 한 줄. `tk-*` 스타일, 좁은 화면(639px 이하)은 요청 카드·대화 창을 아래에 |
| `lib/three/fog.ts` | Fog of War CSS 비네트 반경 헬퍼 — 어느 화면에도 연결되어 있지 않다 ([ADR 005](../adr/005-fog-of-war-business-model.md)) |
| `apps/realtime/src/main.ts` | 실시간 서버 부트스트랩 — 설정을 읽은 뒤 socket.io CORS(`WEB_ORIGIN`)를 넣는 어댑터(`CorsIoAdapter`), 포트 9002 |
| `apps/realtime/src/auth/access-token.ts` | `AccessTokenVerifier` — `/sector` 접속 토큰의 서명·만료·종류를 API 서버와 같은 `JWT_ACCESS_SECRET`으로 확인(DB 조회 없음, 시크릿이 없으면 거절) |
| `apps/realtime/src/room/room.gateway.ts` | 방 중계 익명 socket.io 게이트웨이(`/room`, 플레이 씬) — 방 배정(20명)·35ms 방 단위 변경분 방송, 만남 대화 이벤트를 받아 판정(`relay/talk.ts`)에 넘긴다(같은 방 사람끼리만 닿는다) |
| `apps/realtime/src/proximity/proximity.gateway.ts` | 근접 중계 익명 socket.io 게이트웨이(`/proximity`, 내 주변) — 실제 좌표, 사람마다 반경 200m 가까운 19명 선택·입장 전체 상태·퇴장 `leave` |
| `apps/realtime/src/relay/relay.ts` | 두 익명 게이트웨이가 함께 쓰는 상태 보관·필드 검증·거리 예산·순간이동·빈도 제한(`countMessage` — 상태와 대화 이벤트가 같은 초당 한도를 쓴다) |
| `apps/realtime/src/relay/talk.ts` | 만남 대화 판정(`Talks`) — 요청(6m·15초·1분 6번)·수락·거절 쿨다운(5분)·서로 걸면 바로 열기, 글 검증(0.5초·200자·링크)과 두 사람에게만 보내기, 멀어짐(10m 밖 10초)·조용함(3분)·떠남으로 끝내기. 사람 찾기·거리·보내기는 게이트웨이가 `TalkHost`로 넘긴다 |
| `shared/relay/contract.ts` | 익명 멀티플레이 소켓 이벤트 이름·페이로드 계약(위치·방향·모션·색 시드, 만남 대화 `talk*` 이벤트)과 중계별 네임스페이스·위치 자리수(`RELAYS`), 만남 대화 수치(`TALK`)·링크 판별(`hasLink`) — 프론트·실시간 서버 socket.io 제네릭 단일 소스 |
| `apps/realtime/src/sector/sector.gateway.ts` | 섹터 중계 socket.io 게이트웨이(`/sector`, 맵) — 섹터 판정·속도 검증·5Hz 묶음 브로드캐스트 (`shared/sector/contract` 제네릭 타입). 붙는 화면은 맵과 함께 예정 |
| `shared/sector/contract.ts` | 섹터 중계 소켓 이벤트 이름·페이로드 계약 — socket.io 제네릭 단일 소스 |
| `shared/sector/grid.ts` | 섹터 격자(500m)·거리·이동 속도 검증 계산 — 단일 소스 |
| `apps/api/src/billing/fulfillment.worker.ts` | 결제 완료 주문을 폴링해 아바타·라이선스 발급 |
| `apps/api/src/database/database.service.ts` | pg Pool 위의 Drizzle — 트랜잭션별 `app.user_id`/`app.user_role` RLS 컨텍스트를 넣고 트랜잭션(`Tx`)을 넘김(`withUser`·`withAdmin`), UNIQUE 위반 판별(`uniqueViolation`) |
| `apps/api/src/database/schema.ts` | Drizzle 스키마 — 마이그레이션 0000~0010을 적용한 테이블·enum·시퀀스·인덱스·RLS 정책과 같음. 고치면 `npm run db:generate`로 다음 번호 마이그레이션을 만든다 |

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [프론트엔드 컨벤션](../frontend/conventions.md)
- [백엔드 컨벤션](../backend/conventions.md)
- [온보딩 — 개발 명령어](../onboarding/commands.md)
