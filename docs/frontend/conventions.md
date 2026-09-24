# 프론트엔드 개발 컨벤션

---

## 디자인 시스템

### 테마 — Animal Crossing

Tailwind CSS v4 + `@theme` 블록 기반 커스텀 디자인 시스템. 색상 토큰은 `oklch()` 색공간으로 정의한다.

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --font-display: var(--font-display), "Nunito", ui-sans-serif, system-ui, sans-serif;
  --font-body:    var(--font-display), "Nunito", ui-sans-serif, system-ui, sans-serif;
  --font-mono:    var(--font-mono),    "JetBrains Mono", ui-monospace, monospace;
}
```

### 색상 토큰

| 토큰 | 용도 |
|---|---|
| `--color-paper` | 기본 배경 (크림 화이트) |
| `--color-grass` | 주요 액션 컬러 (초록) |
| `--color-grass-light` | 활성 상태 배경, 테두리 |
| `--color-bark` | 기본 텍스트 (짙은 갈색) |
| `--color-sky` | 보조 배경 (하늘 파랑) |
| `--color-sand` | CTA 섹션 배경 |

모든 토큰은 `app/globals.css`의 `@theme` 블록에서 정의하며, Tailwind 유틸리티(`bg-paper`, `text-bark` 등)나 `var(--color-*)` 형태로 사용한다. 보조 단계(`-2`, `-3`, `-dark`)와 `--color-accent*`, 그림자(`--shadow-card`, `--shadow-btn`), 이징(`--ease-smooth`, `--ease-bounce`) 토큰도 같은 블록에 있다.

### 폰트

- **Display / Body**: Nunito (Google Fonts, `next/font/google`)
- **Mono**: JetBrains Mono (코드, 시리얼 번호 등)
- **루트 3D 씬**: 로딩 화면·HUD·정보 모달은 `/ref-assets/fonts/Stylish-Regular.woff2`를 씬 안에서 `@font-face`로 불러 쓴다

```tsx
// app/layout.tsx
import { Nunito, JetBrains_Mono } from 'next/font/google'
const nunito = Nunito({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
```

### 애니메이션 토큰

`@theme`의 `--animate-*` 토큰이 Tailwind `animate-*` 유틸리티가 된다.

| 유틸리티 | 효과 | 사용처 |
|---|---|---|
| `animate-float` | 4초 상하 부유(−10px) | 정의만 있음 |
| `animate-float-slow` | 6초 상하 부유 | 정의만 있음 |
| `animate-sway` | 5초 좌우 흔들림(±3°) | 정의만 있음 |
| `animate-cute-bounce` | 0.9초 스쿼시·스트레치 바운스 | `CuteLoader` (페이지 전환 로딩 캐릭터) |
| `animate-cute-shadow` | 0.9초 그림자 축소·확대 | `CuteLoader` |

`fog-vignette` 유틸리티는 `--fog-radius` 런타임 변수를 쓰는 radial-gradient 비네트로, `lib/three/fog.ts`와 짝을 이룬다. 두 월드 모두 이 비네트를 붙이지 않는다.

### 로그인 페이지 레이아웃

Spot Virtual 스타일 스플릿 레이아웃 (`app/(auth)/login/page.tsx`):

| 영역 | 비율 | 역할 |
|---|---|---|
| 좌측 패널 | 58% (lg 이상만 표시) | `/illustration-login.png` 중앙 정렬 |
| 우측 패널 | 42% | 로그인 폼 (최대 너비 320px) |

버튼·입력창 높이 44px, border-radius 0.5rem, 주요 액션 색상 `#22c55e` 고정.

---

## 3D 월드 — 루트 3D 씬과 대시보드 월드 (ADR 001)

3D 월드는 두 갈래다. 공개 제품 진입점인 **루트 3D 씬**과, 로그인 유저가 실시간으로 만나는 **대시보드 월드**가 서로 다른 렌더링 구조로 동작한다.

| 구분 | 루트 3D 씬 | 대시보드 월드 |
|---|---|---|
| 경로·진입점 | `/` · `app/summer-afternoon/scene.tsx` | `/dashboard` · `components/world/WorldCanvas.tsx` |
| 베이스 | 베이크드 로우폴리 3D 씬 (`/ref-assets` 참조 에셋, 여름 오후 해변 마을) | Mapbox GL Standard 실지형 지도 + Three.js 커스텀 레이어 |
| 좌표계 | 씬 로컬 미터 (Y-up) | 위경도 (EPSG:4326). 오브젝트는 원점 기준 미터로 변환해 배치 |
| 렌더러 | 씬 전용 `WebGLRenderer` 단일 캔버스 | Mapbox 캔버스의 WebGL 컨텍스트를 공유하는 `WebGLRenderer` |
| 네트워크 | 없음 (인증·위치 동기화·채팅·음성 없음) | socket.io 위치·채팅, LiveKit 섹터 음성 룸 접속·구독 (마이크 송출 UI 예정) |
| 미니맵 | 5시 GIS 미니맵 | 없음 |

### 렌더러 초기화 규칙

각 월드의 렌더러는 아래 지점에서만 만든다.

- **루트 3D 씬**: `app/summer-afternoon/scene.tsx`가 `new THREE.WebGLRenderer({ antialias: true })`로 만든다. 픽셀 비율은 `min(devicePixelRatio, 2)`, 그림자는 `PCFSoftShadowMap`. 후처리는 EffectComposer로 `RenderPass` → `LUTPass`(KTX2 LUT) → `OutputPass` → 인트로 전환 `ShaderPass` 순서다.
- **대시보드 월드**: `lib/map/context.ts`의 `initWorldMap`만 렌더러를 만든다. 커스텀 레이어(`three-scene`, slot `top`)의 `onAdd`에서 Mapbox의 캔버스와 GL 컨텍스트로 생성하고 `autoClear = false`로 둔다.

```typescript
// lib/map/context.ts — 대시보드 월드 렌더러는 Mapbox GL 컨텍스트를 공유한다
onAdd(m, gl) {
  renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
  renderer.autoClear = false
}
```

- 개발용 에셋 뷰어 `/preview`(`app/preview/page.tsx`)는 자체 렌더러와 OrbitControls를 쓴다.

### 렌더 루프 규칙

- **루트 3D 씬**: `scene.tsx`가 소유한 단일 `requestAnimationFrame` 루프에서 돈다. 프레임 간격(dt)은 0.1초로 클램프하고, 3인칭 컨트롤러 갱신 → 캐릭터 포즈(idle/run/air, 0.15초 크로스페이드) 전환 → 태양 그림자 캐릭터 추적 → 발소리 → UFO 부유·근접 판정 → 애니메이션 믹서 → 갈매기 → 하늘 돔 카메라 추종 → LOD 갱신 → 인트로 전환 uniform → `composer.render()` 순서를 지킨다
- **대시보드 월드**: 렌더링은 Mapbox가 구동한다. 커스텀 레이어 `render()`가 매 프레임 `projectionMatrix`(Mapbox MVP × 원점 이동·미터 스케일·축 변환)를 갱신하고 `resetState()` → `clearDepth()` → `render()` → `triggerRepaint()`를 호출한다. 깊이만 비우므로 캐릭터가 3D 건물에 가리지 않는다. `WorldCanvas`의 `requestAnimationFrame` 루프는 PC 키보드 이동, 캐릭터 애니메이션, 피어 위치 보간(9/s)만 담당한다
- 루트 3D 씬의 거리 안개는 램프 셰이더가 카메라 거리 40~300m 구간에서 명도를 0.6으로 모으고 채도를 0.3 이하로 누르는 고정값이다. 가시거리 라이선스 등급은 두 월드 모두 렌더링에 반영하지 않는다

### 오브젝트 생명주기

- `.bin` 에셋은 `lib/three/binLoader.ts`의 `loadBinGeometry`로만 로드한다. 이름별 Promise 캐시와 공유 DRACOLoader 워커를 쓰며, 캐시가 소유한 지오메트리(`userData.shared = true`)는 dispose하지 않는다. 인스턴스마다 속성을 붙여야 하면 `clone()`한 뒤 쓴다
- 대시보드 월드의 캐릭터는 `lib/three/character.ts`의 `loadCharacter`(ref-assets kid 스킨드 메시)로 만들고 `Character.dispose()`로 정리한다. 내 캐릭터는 로드에 실패하면 `createCharacterMesh` 절차적 메시로 대체하고, 피어 캐릭터에는 폴백이 없다. 루트 3D 씬의 kid는 `scene.tsx`가 `createSkin`으로 직접 조립한다
- 대시보드 월드의 피어 오브젝트 해제는 `lib/three/prune.ts`의 `PruneManager.tick()`으로만 한다(50m 이동마다 450m 밖 오브젝트를 dispose 후 씬에서 제거)
- 루트 3D 씬은 언마운트 시 루프를 멈추고 오디오·머티리얼·KTX2 로더·컴포저·렌더러를 dispose한 뒤 캔버스를 제거한다. 대시보드 월드는 소켓·음성을 끊고 캐릭터를 dispose한 뒤 `disposeBinLoader()`와 `map.remove()`를 호출한다

---

## 이동·카메라

### 루트 3D 씬

- **PC**: WASD·방향키로 카메라 기준 전후좌우로 이동하고, 스페이스로 점프한다. 마우스 왼쪽 버튼을 누르고 있으면 화면 고정점(가로 중앙, 위에서 72.5% — 캐릭터 발밑)에서 커서까지의 방향으로 이동하며, 200px 이상 떨어지면 최고 속도(3m/s)가 된다. 오른쪽 클릭도 점프다.
- **모바일**: 화면을 누른 채 끌면 PC 마우스와 같은 화면 고정점 기준 가상 조이스틱으로 이동한다. 모바일 GPS는 5시 미니맵의 실제 위치 표시에만 쓰이고 월드 이동을 직접 구동하지 않는다.
- **카메라**: 3인칭 추적 카메라로 씬 안을 이동한다(`app/summer-afternoon/thirdPerson`). 화면 중심 주체는 캐릭터이며, 이동 좌표는 씬 로컬 좌표이고 서버로 보내지 않는다. 카메라는 시선 목표점(발 위 1.2m) 중심 반경 5.9m·앙각 9.866°의 고정 각도로 서며, 리그 세부는 [ADR 007](../adr/007-quarter-view-camera-lock.md)을 따른다.
- 캐릭터는 충돌 메시(`collider.bin`) 지면을 따라 걷고, 벽 앞과 0.6m보다 높은 단차 앞에서는 멈춘다(점프 중에는 단차에 올라설 수 있다).

### 대시보드 월드

- **PC**(`pointer: coarse`가 아닌 기기): WASD·방향키로 이동한다(남북 3m/s — 같은 도/초를 경도에도 더해 동서는 약 2.4m/s, 대각선은 약 3.8m/s. `WorldCanvas`의 `window` 키보드 리스너, 입력창 포커스 중에는 무시).
- **모바일**: 실제 GPS(`lib/geo/watchPosition.ts`)로 이동한다. 위치를 받지 못하면 좌상단에 위치 권한 안내를 띄운다.
- 시작 위치는 GPS 현재 위치(`lib/geo/currentPosition.ts`)이며, 얻지 못하면 서울시청 부근(126.9784, 37.5666)에서 시작한다.
- 새 위치는 `lib/map/snap.ts`의 `snapToRoad`로 15m 이내 도로 선분에 스냅한 뒤 캐릭터 이동 → 지도 중심 고정(`followPlayer`) → 음성 섹터 동기화 → 프루닝 순서로 반영한다.
- 사이드바(PC)·하단 내비게이션(모바일)의 "내 위치로" 버튼은 `recenter-request` 이벤트를 보내고, `WorldCanvas`가 GPS를 다시 조회해 그 위치로 이동한다.
- **카메라**(`lib/map/camera.ts`): pitch 45°·bearing 45° 고정(회전·기울기 입력 비활성), 드래그 팬·키보드 조작 비활성, 줌만 허용한다(스크롤·박스·더블클릭·핀치, 14~20).

---

## 씬 HUD — 우상단 버튼·정보 모달

씬 HUD는 `app/summer-afternoon/scene.tsx`에서 `sa-*` 클래스로 렌더한다. 수치는 뷰포트 폭 1200px 초과 기준이며, 1200px 이하 값은 괄호로 적는다.

### 우상단 버튼

| 항목 | 규칙 |
|---|---|
| 위치 | 위·오른쪽 35px(20px), 세로 한 줄 가운데 정렬, 버튼 간격 16px(12px) |
| 버튼 | 32×32px 크림(`#f9efdc`) 사각형, 모서리 5px, 10° 회전, 하드 그림자 `2px 2px 0 #716c66`. 아이콘은 버튼 안에서 역회전한다(사운드·정보 −10°, 옷 색 사각형 −16°) |
| 인터랙션 | 호버 1.1배. 누르면 2px 눌리며 그림자가 사라진다 |
| 등장 | 인트로 시작 2.5초 뒤 오른쪽 80px 밖에서 1.5초 easeOutCubic으로 들어온다 |
| 비밀 카운터 | 버튼 바로 아래 `n/5`. Stylish 33px(27px), 크림색 + `2px 2px 0 #716c66` 텍스트 그림자 |

| 버튼(위→아래) | 동작 |
|---|---|
| 사운드 | 소리 꺼짐으로 시작하고 누를 때마다 켜짐·꺼짐을 전환한다. 아이콘은 꺼짐 = 사선 그은 스피커, 켜짐 = 스피커 + 막대 |
| 옷 색 | 누를 때마다 캐릭터 옷 색조(`uSeed` 소수부)를 무작위로 바꾼다. 첫 색도 로드 시 무작위다. 버튼 사각형은 `hsv(h, 0.324, 0.678)`로 표시한다 |
| 정보 | 화면 가운데 정보 모달을 연다 |

버튼 클릭 효과음은 소리가 켜져 있을 때만 난다.

### 정보 모달

- **내용**: 제목 "Summer Afternoon"(45px, 32px), 소개·감사 문구(30px, 25px), 제작자 링크 "Vicente"(`https://vlucendo.com`, 새 탭). 카드 본문 최대 폭 600px, 패딩 50px 60px(64px 26px 40px)
- **열림**: 배경이 0.08초 뒤 0.75초에 걸쳐 크림색(`rgb(252,246,236)`, 95%)으로 흐려진다. 카드는 0.35초부터 커지고, 그림자 카드는 −45°에서 1°로 돌며 앞서 커진다. 본문은 1.5초부터 페이드인한다. 모달이 열리면 우상단 버튼은 오른쪽으로 빠진다
- **닫기**: X 버튼·모달 바깥 클릭·ESC. 열림 애니메이션(2초)이 끝나기 전에는 닫기 입력을 받지 않는다
- **닫힘**: 카드가 0.25초에 사라지고 배경 흐림은 0.15초 뒤 0.7초에 걸쳐 걷힌다. 우상단 버튼은 0.5초 뒤 1.4초에 걸쳐 돌아온다

---

## 5시 GIS 미니맵 — Mapbox GL JS

루트 3D 씬 화면 5시(우하단)에 나침반형 GIS 미니맵(`components/world/MiniMap.tsx`)을 **독립 경량 Mapbox GL 캔버스**로 띄운다. 유저의 실제 GPS 위치를 실지형 지도 위에 표시하며, 루트 3D 씬 렌더러와는 서로 다른 WebGL 컨텍스트로 분리 운용한다(씬 성능 우선). 인트로 리빌이 끝난 뒤 마운트되고, `NEXT_PUBLIC_MAPBOX_TOKEN`이 없거나 WebGL을 쓸 수 없으면 지도를 만들지 않아 원형 테두리만 남는다. 스타일은 Standard + `night` 프리셋이며 지명·도로·교통·POI 라벨을 표시한다.

### 소스·레이어 네이밍 규칙

미니맵과 대시보드 월드 지도에 소스·레이어를 추가할 때 공통으로 따른다. 대시보드 월드의 Three.js 커스텀 레이어 id는 `three-scene`이다.

| 유형 | 패턴 | 예시 |
|---|---|---|
| 소스 | `{domain}-source` | `player-source`, `sponsor-source` |
| 레이어 | `{domain}-{type}-layer` | `sponsor-marker-layer`, `player-dot-layer` |

### 레이어 생명주기

- 레이어 추가·basemap 설정은 `map.on('load', () => { ... })` 내부에서만 수행
- 컴포넌트 언마운트·페이지 이동 시 `map.remove()` 반드시 호출(미니맵은 `ResizeObserver.disconnect()`도 함께)
- 미니맵은 유저를 추적해 고정하며, 드래그·줌 조작은 잠근다(`interactive: false`). 첫 GPS 좌표는 `jumpTo`, 이후 갱신은 `easeTo`(600ms)로 따라간다

### 크기 전환

- 미니맵을 클릭하면 152px ↔ 340px 원형으로 0.5초 동안 커지고 작아진다
- 전환 중에는 컨테이너 크기가 매 프레임 바뀌므로, `ResizeObserver`로 크기 변화를 따라 `map.resize()`를 호출해 캔버스가 늘어나 보이지 않게 한다

---

## Next.js App Router 라우트

### 라우트 구성

| 경로 | 위치 | 목적 | 페이지 게이팅 |
|---|---|---|---|
| `/` | `app/page.tsx` → `app/summer-afternoon/scene.tsx` | 루트 3D 씬 (공개 제품 진입점) | 없음 |
| `/dashboard` | `app/(game)/dashboard` | 대시보드 월드 (`WorldCanvas` + `Hud`) | 없음 (소켓·음성은 액세스 토큰 필요) |
| `/store` | `app/(game)/store` | 아바타·라이선스 상점 (주문 생성, 주문·발급 상태·내 가시거리 조회) | 없음 (API 호출은 액세스 토큰 필요) |
| `/login`, `/verify` | `app/(auth)` | `/login`: 이메일+비밀번호 로그인·회원가입, 카카오/구글 OAuth 시작(`?error=` 표시). `/verify`: 본인인증 자리표시(Phase 5 예정). OAuth 콜백은 Route Handler `app/api/auth/oauth/[provider]/callback`이 처리 | 없음 |
| `/preview` | `app/preview` | ref-assets 개발 뷰어 (자체 에셋 교체 시 규격 대조) | 없음 |

`(game)` 그룹은 `Sidebar`(PC)·`BottomNav`(모바일) 레이아웃 셸을 공유한다. 대시보드 월드는 로그인 세션(리프레시 쿠키)이 없으면 지도와 로컬 이동만 동작하고, 위치 동기화·음성은 접속되지 않는다.

### 미들웨어 인증 규칙 (`middleware.ts`)

- `middleware.ts`의 `matcher`가 빈 배열이라 미들웨어는 어떤 경로에도 실행되지 않는다. 모든 페이지 라우트가 공개다
- 라우팅 게이팅 로직은 `lib/auth/middleware.ts`의 `applyAuthMiddleware`에 있다. 리프레시 쿠키가 없으면 `/dashboard`·`/store`·`/admin`을 `/login?next=`로, 있으면 `/login`·`/`를 `/dashboard`로 보낸다. 인증 게이팅을 다시 켤 때 `middleware.ts`에 연결한다
- 실제 인가는 NestJS 전역 가드(`AccessTokenGuard`)와 PostgreSQL RLS가 담당한다

### `app/api/` = BFF 프록시

`app/api/` Route Handler는 브라우저와 NestJS API 사이의 얇은 **BFF 프록시**다. 브라우저는 NestJS를 직접 호출하지 않으며(API 주소 비노출 + CORS 불필요), 프록시가 `Authorization` 헤더를 그대로 전달한다. **비즈니스 로직은 NestJS `apps/api`에 있고, `app/api/`에는 로직을 두지 않는다.**

| 위치 | 프록시 대상 |
|---|---|
| `app/api/auth/*` | 로그인·로그아웃·회원가입·리프레시·OAuth(`oauth/[provider]`, `oauth/[provider]/callback`) |
| `app/api/billing/*` | 상품 조회(`products`), 주문 생성·조회(`orders`) |
| `app/api/me/*` | 내 캐릭터(`characters`), 내 라이선스(`license`) |
| `app/api/voice/token` | LiveKit 룸 토큰 발급 |
| `app/api/health` | Next 서버 자체 응답(`{ "status": "ok" }`). API 서버로 프록시하지 않는다 |

프록시 계층 구현은 `lib/api/`(client, config, proxy)에 둔다. 리프레시 토큰은 로그인·회원가입·OAuth 콜백·리프레시 라우트가 `refresh_token` httpOnly 쿠키로 설정하고, 로그아웃 라우트가 지운다. PG 결제 웹훅은 BFF를 거치지 않고 API 서버(`POST /billing/webhook`)로 직접 들어간다. 월드 소켓도 브라우저가 `NEXT_PUBLIC_WS_URL`로 직접 붙는다. `app/api/`에 결제·공간·음성 **비즈니스 로직** 추가 금지(프록시 전달만).

---

## React 상태 관리

### 상태 분류 원칙

| 유형 | 위치 | 예시 |
|---|---|---|
| 액세스 토큰 | 브라우저 메모리(`lib/auth/session.ts`, WebSocket 접속에 필요) | Access Token |
| 인증 API 호출 | `lib/api` 프록시 경유(401이면 리프레시 후 한 번 재시도) | 로그인, 리프레시 |
| 지도·타 유저 위치 | socket.io 채널 직접 소비 (`lib/realtime/world.ts`) → `WorldCanvas`의 ref(Map)에 보관 | 실시간 좌표 |
| 가시거리 라이선스 | `/api/me/license` 조회 (상점) | 25m(기본), 100m, 300m |
| 일시적 UI 상태 | `useState` / `useReducer` | 모달 열림, 로딩 |

> 실시간 위치·채팅 이벤트 타입은 `shared/world/contract.ts`(프론트·백엔드 단일 소스)에서 온다. `lib/realtime/world.ts`가 이를 재노출하며, 소비 측(WorldCanvas)은 `lib/realtime/world.ts`에서 import한다.

### 금지 패턴

- 위치 좌표를 React state에 저장 금지 → socket.io 채널에서 직접 소비
- 액세스 토큰을 `localStorage`에 저장 금지 → 브라우저 메모리에만 보관
- 리프레시 토큰은 httpOnly 쿠키로만 관리(Next 라우트가 관리, JS 접근 불가)
- 전역 상태 라이브러리(Redux, Zustand 등) 도입은 팀 합의 후 진행

---

## 컴포넌트 구조

### 디렉토리

```
components/
├── hud/          ← 대시보드 HUD. Hud(index.tsx)는 화면 UI 없이 null을 렌더하고 onMove·onChat 배선만 둔다
│                    (DirectionPad·Joystick·ChatInput 컴포넌트는 렌더되지 않는다)
├── layout/       ← (game) 레이아웃 셸: Sidebar(PC), BottomNav(모바일) — "내 위치로" 버튼 포함
├── world/        ← WorldCanvas(대시보드 월드), MiniMap(루트 3D 씬 5시 GIS 미니맵)
├── avatar/       ← AvatarCard (아바타 미리보기 카드, 현재 사용처 없음)
├── transition/   ← PageTransition, CuteLoader (페이지 전환 스피너)
└── ui/           ← 공통 UI (Button, Card, Toast, Spinner)
```

대시보드 월드의 채팅은 송신 배선(`onRegisterChatHandler` → `chat`)만 있고, 입력 UI와 수신 표시는 없다.

### 캔버스·DOM 이벤트 규칙

- 루트 3D 씬의 HUD(우상단 버튼·모달·미니맵)는 캔버스 컨테이너의 형제 요소로 렌더해, HUD 입력이 캔버스의 이동 입력에 닿지 않게 한다
- 캔버스 위에 겹치되 입력을 받지 않는 표시 요소(비밀 카운터, 미니맵의 N 표시·위치 점 등)는 `pointer-events: none`
- 키보드 입력은 `window` 리스너로 받는다(루트 3D 씬: 3인칭 컨트롤러 이동·점프, 정보 모달 ESC / 대시보드 월드: `WorldCanvas` 이동). 루트 3D 씬 오디오는 첫 `pointerdown`·`keydown`에서 만든다
- 3D 캔버스에 `click`/`touchstart` 리스너 직접 바인딩 금지 (백엔드 컨벤션 프론트엔드 하네스)
- 캔버스의 `pointer*`·`contextmenu` 리스너는 3인칭 컨트롤러(`app/summer-afternoon/thirdPerson.ts`)만 등록하며, 이동·점프 조작 전용이다. 오브젝트 선택·팝업 호출에는 쓰지 않는다

---

## 관련 문서

- [ADR 001 — WebGL 컨텍스트 구성](../adr/001-webgl-context-sharing.md)
- [ADR 007 — 카메라 잠금](../adr/007-quarter-view-camera-lock.md)
- [백엔드 컨벤션 — 4대 하네스](../backend/conventions.md)
- [보안 규격 — JWT·RLS](../backend/security/encryption.md)
- [프로젝트 구조](../architecture/project-structure.md)
