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
| 네트워크 | 익명 socket.io `/scene` — 같은 방 아이 상태만 중계 (인증·채팅·음성 없음, 서버가 없으면 혼자) | socket.io 위치·채팅, LiveKit 섹터 음성 룸 접속·구독 (마이크 송출 UI 예정) |
| 미니맵 | 5시 GIS 미니맵 | 없음 |

내 동네 시험판(`/neighborhood`)은 루트 3D 씬의 렌더러·셰이더·3인칭 조작·원격 아이를 그대로 쓰고, 바닥만 실제 길로 깐다. 좌표는 GPS 위치를 격자에 맞춘 원점 기준 로컬 미터이고, 다른 사람과는 위경도로 주고받는다(아래 [내 동네 시험판](#내-동네-시험판-neighborhood) 절).

### 렌더러 초기화 규칙

각 월드의 렌더러는 아래 지점에서만 만든다.

- **루트 3D 씬**: `app/summer-afternoon/scene.tsx`가 원본처럼 `new THREE.WebGLRenderer({ antialias: false, depth: false })`로 만들고 계단 현상은 SMAA로 편다. 픽셀 비율은 `min(devicePixelRatio, 1.5)`(데스크톱 사파리는 1)에 적응형 배수(0.7~1, 인트로 2초 뒤부터 4초마다 평균 FPS 30 미만이면 −0.1·60 이상이면 +0.1, 방향이 4번 바뀌면 멈춤)를 곱한다. 그림자는 `PCFSoftShadowMap`. 후처리는 EffectComposer로 `RenderPass` → 최종 패스(`postprocess.ts` — 사면체 보간 LUT·인트로 리빌·정보 모달 오버레이, 선형 공간) → `SMAAPass` → `OutputPass` 순서다. 카메라는 near 1m·far 175m다.
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

- **루트 3D 씬**: `scene.tsx`가 소유한 단일 `requestAnimationFrame` 루프에서 돈다. 프레임 간격(dt)은 0.1초로 클램프하고, 3인칭 컨트롤러 갱신 → 캐릭터 애니메이션 가중치(`kidAnimation.ts` — idle↔run은 수평 속도, air·bored가 덮음) → 동적 그림자 중심을 카메라 시선 앞 6m로 이동 → 오디오(환경음·발소리) → 터치 원 UI → 같은 방 다른 아이들(`remotes.ts` — 위치·방향 보간, 가중치, 100m 안·화면 안일 때만 포즈) → 캐릭터 믹서 → 갈매기 비행 → 하늘 돔 카메라 추종 → 인트로 리빌·오버레이 uniform → 적응형 DPR → `composer.render()` 순서를 지킨다. LOD 단계는 렌더러가 `LODExtended.update`로 고르고, 생물 애니메이션과 비밀 판정은 각 오브젝트의 `onBeforeRender`(화면에 그려질 때만)에서 한다
- **대시보드 월드**: 렌더링은 Mapbox가 구동한다. 커스텀 레이어 `render()`가 매 프레임 `projectionMatrix`(Mapbox MVP × 원점 이동·미터 스케일·축 변환)를 갱신하고 `resetState()` → `clearDepth()` → `render()` → `triggerRepaint()`를 호출한다. 깊이만 비우므로 캐릭터가 3D 건물에 가리지 않는다. `WorldCanvas`의 `requestAnimationFrame` 루프는 PC 키보드 이동, 캐릭터 애니메이션, 피어 위치 보간(9/s)만 담당한다
- 루트 3D 씬의 거리 안개는 램프 셰이더가 카메라 거리 40~300m 구간에서 명도를 0.6으로, 채도를 0.3으로 모으는 고정값이다(원본 식). 가시거리 라이선스 등급은 두 월드 모두 렌더링에 반영하지 않는다
- 루트 3D 씬의 그림자는 두 겹이다 — 동적 그림자맵(2048², 시선 앞 ±12m)과 로딩 때 월드 전체를 한 번 구운 정적 그림자(`shadows.ts`, 8192²·모바일 4096², LOD 단계별 3장). 동적 그림자 중심에서 9~12m 사이에서 정적 그림자로 넘어간다. 캐릭터가 아닌 면은 카메라 1.5~2m 안에서 가로줄 디더로 솎아낸다

### 오브젝트 생명주기

- `.bin` 에셋은 `lib/three/binLoader.ts`의 `loadBinGeometry`로만 로드한다. 이름별 Promise 캐시와 공유 DRACOLoader 워커를 쓰며, 캐시가 소유한 지오메트리(`userData.shared = true`)는 dispose하지 않는다. 인스턴스마다 속성을 붙여야 하면 `clone()`한 뒤 쓴다
- 대시보드 월드의 캐릭터는 `lib/three/character.ts`의 `loadCharacter`(ref-assets kid 스킨드 메시)로 만들고 `Character.dispose()`로 정리한다. 내 캐릭터는 로드에 실패하면 `createCharacterMesh` 절차적 메시로 대체하고, 피어 캐릭터에는 폴백이 없다. 루트 3D 씬의 kid는 `scene.tsx`가 `createSkin`으로 직접 조립하고, 같은 방 다른 아이는 `remotes.ts`가 같은 지오메트리·클립으로 한 명마다 스킨드 메시·믹서·재질(색 시드)을 따로 만든다. 나가면 0.25초에 걸쳐 줄인 뒤 스켈레톤·재질을 dispose하고, 방에 다시 들어가거나 연결이 끊기면 곧바로 모두 지운다
- 대시보드 월드의 피어 오브젝트 해제는 `lib/three/prune.ts`의 `PruneManager.tick()`으로만 한다(50m 이동마다 450m 밖 오브젝트를 dispose 후 씬에서 제거)
- 루트 3D 씬은 언마운트 시 루프를 멈추고 씬 소켓을 닫은 뒤 다른 아이들·오디오·머티리얼·정적 그림자맵·바다 반사·갈매기·터치 원·KTX2 로더·컴포저·렌더러를 dispose하고 캔버스를 제거한다. 대시보드 월드는 소켓·음성을 끊고 캐릭터를 dispose한 뒤 `disposeBinLoader()`와 `map.remove()`를 호출한다

---

## 이동·카메라

### 루트 3D 씬

- **PC**: WASD·방향키로 카메라 기준 전후좌우로 이동하고, 스페이스로 점프한다(누르고 있어도 한 번만 뛴다). 마우스 왼쪽 버튼을 누르고 있으면 화면 고정점(가로 중앙, 위에서 72.5% — 캐릭터 발밑)에서 커서까지의 방향으로 이동하며, 200px 이상 떨어지면 입력이 최대 세기가 된다. 오른쪽 버튼을 짧게(0.5초 미만) 눌렀다 떼도 점프다. 게임패드 0번의 왼쪽 스틱(데드존 0.15~0.25)과 A 버튼도 받는다. 인트로 시작 1.5초 뒤부터 조작을 받고, 정보 모달이 떠 있는 동안과 창이 포커스를 잃으면 입력을 끊는다(하단 비밀 모달은 조작을 막지 않는다). 60초 넘게 멈춰 있으면 캐릭터가 심심해하는 모션(kid-bored)으로 바뀐다.
- **이동 물리**: 원본 수식·상수를 그대로 따른다. 입력만큼 가속하고 매 프레임 감쇠해(관성) 약 0.5초에 걸쳐 최고 속도 약 3.75m/s에 이르고, 손을 떼면 약 0.7m 미끄러져 선다. 점프는 높이 약 1.1m·체공 약 0.5초다.
- **터치**: 첫 손가락은 처음 누른 자리 기준 조이스틱이다(75px 끌면 최대). 누른 자리에 이동 원이 나타나고 안쪽 손잡이가 끄는 방향으로 밀린다(`touchCircles.ts`). 짧게(15px·0.75초 미만) 탭하면 점프하고, 두 번째 손가락 탭은 점프하면서 그 자리에 점프 원을 퍼뜨린다. 휴대폰은 위아래 커서 패럴랙스가 없다. 모바일 GPS는 5시 미니맵의 실제 위치 표시에만 쓰이고 월드 이동을 직접 구동하지 않는다.
- **시작 위치**: 원본 오프닝 좌표(12.2, 2.25, −58) 주변 ±4m에서 무작위로 고른 점을 collider 표면에 세운다.
- **카메라**: 3인칭 추적 카메라로 씬 안을 이동한다(`app/summer-afternoon/thirdPerson`). 화면 중심 주체는 캐릭터이며, 이동 좌표는 씬 로컬 좌표다(같은 방 사람에게 보이도록 씬 소켓으로 보낼 뿐 서버가 물리를 계산하지 않는다). 카메라는 시선 목표점(발 위 1.1m) 중심 반경 5.836m·앙각 9.866°의 고정 각도로 서며, 리그 세부는 [ADR 007](../adr/007-quarter-view-camera-lock.md)을 따른다.
- 캐릭터는 캡슐(반경 = 키 × 0.2)로 충돌 메시(`collider.bin`, `three-mesh-bvh`)와 부딪친다. 벽에서는 벽을 따라 미끄러지고, 캡슐이 타고 넘을 수 있는 낮은 턱만 오르며, 난간에서는 떨어진다.

### 대시보드 월드

- **PC**(`pointer: coarse`가 아닌 기기): WASD·방향키로 이동한다(남북 3m/s — 같은 도/초를 경도에도 더해 동서는 약 2.4m/s, 대각선은 약 3.8m/s. `WorldCanvas`의 `window` 키보드 리스너, 입력창 포커스 중에는 무시).
- **모바일**: 실제 GPS(`lib/geo/watchPosition.ts`)로 이동한다. 위치를 받지 못하면 좌상단에 위치 권한 안내를 띄운다.
- 시작 위치는 GPS 현재 위치(`lib/geo/currentPosition.ts`)이며, 얻지 못하면 서울시청 부근(126.9784, 37.5666)에서 시작한다.
- 새 위치는 `lib/map/snap.ts`의 `snapToRoad`로 15m 이내 도로 선분에 스냅한 뒤 캐릭터 이동 → 지도 중심 고정(`followPlayer`) → 음성 섹터 동기화 → 프루닝 순서로 반영한다.
- 사이드바(PC)·하단 내비게이션(모바일)의 "내 위치로" 버튼은 `recenter-request` 이벤트를 보내고, `WorldCanvas`가 GPS를 다시 조회해 그 위치로 이동한다.
- **카메라**(`lib/map/camera.ts`): pitch 45°·bearing 45° 고정(회전·기울기 입력 비활성), 드래그 팬·키보드 조작 비활성, 줌만 허용한다(스크롤·박스·더블클릭·핀치, 14~20).

### 내 동네 시험판 (`/neighborhood`)

실제 지도의 길을 여름 마을 화풍으로 깔아 미니맵과 맞춰 보는 1단계 시험판이다(`app/neighborhood/`). 같은 동네에 들른 사람은 실제 자리에 보인다. 건물·소품·물·고도는 2단계에서 붙인다([로드맵](../roadmap.md) P2-6).

- **데이터**: OpenStreetMap 벡터 타일(OpenFreeMap, OpenMapTiles 스키마)의 `transportation` 레이어를 z14 타일 단위로 받는다(`lib/geo/vectorTiles.ts`). 철도·지하철·뱃길·공사 중·터널·실내 길은 뺀다. 화면에 출처(OpenStreetMap·OpenMapTiles·OpenFreeMap)를 표기한다
- **좌표**: GPS 위치를 0.001° 격자에 맞춘 점이 원점이다(`lib/geo/localFrame.ts`, 1m = 1m, 동쪽 +x·북쪽 −z). 첫 위치는 15초까지 기다린다(PC는 와이파이로 위치를 잡는 데 8초를 넘기곤 한다). 그래도 못 받으면 서울시청에서 시작하고, 나중에 진짜 위치가 오면 그 자리로 옮긴다(PC는 첫 위치 한 번만, 휴대폰은 계속 따라간다)
- **이어 깔기**(`stream.ts`): 바닥을 한 변 256m 구역으로 나눠 캐릭터가 선 구역 둘레 3×3을 깔아 둔다 — 가장자리에 서도 앞쪽 256m가 깔려 있어 보이는 거리(175m)보다 넉넉하다. 다른 구역으로 넘어가면 앞줄을 한 구역씩 새로 깔고, 두 칸 넘게 멀어진 구역은 치운다. 불러오는 사이 빈 곳은 잔디만 있는 받침 바닥(4km, 구역보다 5cm 아래)이 받친다. 충돌 바닥은 끝없이 넓은 평면 하나다(가장자리 벽·범위 끝 없음)
- **워커에서 그리기**(`ground.worker.ts` · `groundSource.ts`): 타일 받기·해석과 구역 마스크 그리기는 워커의 OffscreenCanvas에서 하고, 메인 스레드는 돌려받은 픽셀(전송, 복사 없음)로 텍스처만 만든다 — 구역 하나를 그리는 데 약 40ms가 들어 메인 스레드에서 그리면 경계를 넘을 때마다 멈칫하기 때문이다. 워커는 받은 z14 타일을 로컬 좌표로 바꿔 12장까지 캐시하고, 구역을 그릴 때 그 구역(+가장 넓은 길 절반 여유)에 걸치는 길만 쓴다. 워커나 OffscreenCanvas가 없거나 워커를 띄우지 못하면 같은 코드를 메인 스레드에서 돌린다
- **바닥 한 구역**(`ground.ts`): 길을 그린 마스크를 원작 지형 셰이더에 꽂는다(구역마다 768², 약 0.33m/px). 채널은 원작 `masks.png`와 같아 r = 차도, b = 인도·보행로(흙길 색)이고, 차선 점선은 원작 `terrain-road`처럼 별도 텍스처의 r에 그린다. 차도 폭은 도로명 끝 글자로 정한다(도로명주소 부여 기준) — 대로 40m, 로 20m, 길 8m이고, 대로·로가 방향마다 한 줄씩(일방) 그려졌으면 한 줄은 절반이라 두 줄이 모여 한 길이 된다. 이름은 같은 타일의 `transportation_name` 레이어에서 도로 선분마다 2m 안의 가장 가까운 이름선을 찾아 다수결로 붙인다. 고속도로·도시고속도로(motorway·trunk)는 이름과 상관없이 대로로, '대로'로 끝나도 간선 등급이 아니면(예: 경기대+로) 로로 본다. 이름이 없으면 등급으로 가늠하고(간선·보조간선 → 로, 그 밖 → 길), 이름 없는 주차장 통로·진입로는 5m, 램프는 8m다. 인도는 양옆 1m다. 길 선은 구역 경계를 넘어 이어 그리므로 이웃 구역과 이음매 없이 맞는다
- **차선 점선 박자**(`ground.ts`): 길 데이터는 타일(약 2km)마다 따로 오고 같은 길이 이웃 타일에도 겹쳐(버퍼) 들어 있어, 선 시작점부터 무늬를 세면 타일 경계 둘레 수십 m에서 두 박자가 겹치고 경계에서 끊긴다. 그래서 가운데 점선만은 제 타일 안쪽으로 잘라 한 번씩만 그리고, 잘린 끝(타일 경계)에는 늘 틈 한가운데가 오게 무늬 시작점을 맞춘다. 양 끝이 모두 타일 경계인 조각은 그 사이에 무늬가 딱 맞게 주기(6m)를 조금 늘이거나 줄인다(100m 조각이면 3% 안). 구역 경계에서는 같은 선을 같은 시작점부터 그리므로 박자가 저절로 맞는다
- **이동**: PC는 여름 마을과 같은 3인칭 조작이다. 휴대폰은 실제 GPS 위치를 따라 걷는다 — 컨트롤러의 `steer` 입력으로 GPS 지점까지 걸어가며, 1.5m 안이면 서고 그보다 4m 더 멀면 최고 속도다. GPS가 한 번에 150m 넘게 튀면(지하철·차) 걸어가지 않고 컨트롤러의 `snap`으로 곧장 옮긴다
- **미니맵**: `MiniMap`에 `track`을 넘기면 GPS 대신 캐릭터 위치를 따라가고, 화면이 보는 쪽이 위로 오게 돌며 N 표시가 테두리를 따라 북쪽을 가리킨다(여름 마을의 미니맵은 GPS 위치·북쪽 위). Mapbox Standard 스타일은 한 번 다시 그리는 데 10~30ms가 들어, 지도를 원 밖으로 사방 48px 넓게 그려 두고 그 안의 이동과 20° 안의 회전은 캔버스를 CSS로만 옮기고 돌린다(그 사이 라벨은 20° 안에서 기운다). 여백을 벗어나거나 더 돌면 그 자리·방향으로 다시 그린다 — 걸을 때 지도를 다시 그리는 것은 12초 안팎에 한 번이고, 가만히 있으면 다시 그리지 않는다. 변환은 Mapbox 컨테이너가 아니라 캔버스에 건다(Mapbox는 컨테이너와 그 위 요소의 CSS 변환을 읽어 크기를 재고, 컨테이너를 `position: relative`로 덮어쓴다 — 그래서 넓히는 것도 감싸는 div가 한다)
- **멀티플레이**: 익명 socket.io `/neighborhood`(`lib/realtime/scene.ts`의 `connectScene(…, 'neighborhood')`)로 여름 마을과 같은 필드를 주고받되, 사람마다 씬 원점이 달라 위치 `p`는 실제 좌표 `[경도, 위도, 높이]`(소수 7·7·2자리, 약 1cm)로 보낸다. 받은 위치는 내 원점 기준 로컬 m로 바꿔 `remotes.ts`에 넘긴다(로컬 축 방향이 모두 같아 방향 `r`은 그대로 쓴다). 방은 없고, 서버가 사람마다 반경 200m 안에서 가까운 19명을 골라 보여 준다(규칙은 백엔드 컨벤션). 멀어졌다 돌아온 사람은 같은 id로 다시 들어오므로, `remotes.ts`는 사라지는 중인 아이에게 갱신이 오면 지금 크기에서 다시 키운다

---

## 씬 HUD — 우상단 버튼·정보 모달·비밀 모달

씬 HUD는 `app/summer-afternoon/scene.tsx`에서 `sa-*` 클래스로 렌더한다. 수치는 뷰포트 폭 1200px 초과 기준이며, 1200px 이하 값은 괄호로 적는다. 애니메이션 이징 `inOut3`은 원본 CustomEase `cubic-bezier(0.6, 0, 0, 1)`이다.

로더는 제목(폰트가 오기 전에는 42px 대체 크기)과 스피너를 보여 주다가, 씬이 준비되면 0.75초(cubic in-out)에 걸쳐 사라지고 0.25초 뒤 인트로를 시작한다. WebGL2가 없으면 로더를 걷고 원본 안내 문구만 띄운다.

### 우상단 버튼

| 항목 | 규칙 |
|---|---|
| 위치 | 위·오른쪽 35px(20px), 세로 한 줄 가운데 정렬, 버튼 간격 16px(12px) |
| 버튼 | 32×32px 크림(`#f9efdc`) 사각형, 모서리 5px, 10° 회전, 하드 그림자 `2px 2px 0 #716c66`. 아이콘은 버튼 안에서 역회전한다(사운드·정보 −10°, 옷 색 사각형 −16°) |
| 인터랙션 | 호버 1.1배. 누르면 2px 눌리며 그림자가 사라지고, 누르는 순간 클릭음이 난다(0.15초 easeOutCubic) |
| 등장 | 인트로 시작 2.5초 뒤 오른쪽 80px 밖에서 1.5초 easeOutCubic으로 들어온다 |
| 비밀 카운터 | 버튼 바로 아래 `n/5`. Stylish 33px(27px), 크림색 + `2px 2px 0 #716c66` 텍스트 그림자 |

| 버튼(위→아래) | 동작 |
|---|---|
| 사운드 | 소리 꺼짐으로 시작하고, 첫 입력(페이지 클릭·캔버스 터치·키)에서 켜진다. 이후 누를 때마다 켜짐·꺼짐을 전환한다. 아이콘은 꺼짐 = 사선 그은 스피커, 켜짐 = 스피커 + 막대 |
| 옷 색 | 누를 때마다 피부색(`uSeed` 정수부 0~3)과 옷 색조(소수부, 직전 색과 0.2 이상 차이)를 무작위로 바꾼다. 첫 색도 로드 시 무작위다. 버튼 사각형은 `HSL(색조, 0.4, 0.3)`을 선형 값으로 보고 sRGB로 바꾼 색이다 |
| 정보 | 화면 가운데 정보 모달을 연다 |

### 정보 모달

- **내용**: 제목은 제품 이름 "어슬렁"(45px, 32px), 소개 문구 두 문단(30px, 25px, 한글이 어절 단위로 줄바꿈되게 `word-break: keep-all`), 마지막 줄은 원작 출처 링크 "원작 Summer Afternoon · Vicente"(`https://summer-afternoon.vlucendo.com/`, 새 탭). 카드 본문 최대 폭 600px, 패딩 50px 60px(64px 26px 40px). 비밀 5개를 다 찾으면 같은 모달이 축하 문구("비밀 5개를 모두 찾았어요!")로 뜬다. 로딩 화면 제목도 제품 이름이다(레이아웃·애니메이션은 원본 그대로, 원작자 1인칭 소개문·감사 인사는 쓰지 않는다)
- **열림**: 배경은 DOM이 아니라 최종 셰이더 패스가 1초(power2.inOut)에 걸쳐 화면을 `#FFF9EE` 쪽으로 90%까지 덮는다. 그림자 카드가 0.2초부터 −40°에서 1°로 돌며 커지고(2초 `inOut3`), 밝은 카드는 0.35초, 닫기 버튼은 0.95초부터 커진다. 본문은 1.5초부터 0.75초에 걸쳐 나타난다. 우상단 버튼은 0.75초에 걸쳐 오른쪽으로 빠지고(`cubic-bezier(0.5, 0, 0.1, 1)`), 미니맵도 함께 숨는다. 캐릭터 조작이 꺼지고 배경음이 0.4배로 준다
- **닫기**: X 버튼·모달 바깥 클릭·ESC(keyup). 열림 애니메이션(2.25초)이 끝나기 전에는 닫기 입력을 받지 않는다
- **닫힘**: 카드가 0.25초에 사라지고 화면 오버레이는 1초에 걸쳐 걷힌다. 우상단 버튼은 0.5초 뒤 1.5초에 걸쳐 돌아온다

### 비밀 모달

- **발견**: UFO(10m)·alien(3m)·cats(2m)·sloth(3m)·gossip(2m) — 오브젝트가 화면에 그려지는 동안 캐릭터 발이 오브젝트 원점에서 이 거리 안에 들어오면 한 번 발견된다
- **모양**: 화면 하단 가운데 카드(아래 15px(0), 패딩 33px 90px 33px 40px(28px 65px 28px 30px)), 문구 30px(23px) `#989389`. 그림자 카드 `#b5a997`, 밝은 카드 `#fff6e3`, 닫기 버튼 `#faf2e2`. 캔버스 조작을 막지 않는다
- **동작**: 정보 모달과 같은 순서로 나타나고(그림자 카드는 0.5°까지 돈다), 본문이 다 나타난 2.25초 뒤 비밀 카운터가 1 오르며 그 10초 뒤 저절로 닫힌다(0.5초 페이드). 떠 있는 동안 새 비밀을 찾으면 지금 모달을 닫고 이어서 띄운다. 정보 모달이 열리면 닫힌다

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
| `/` | `app/page.tsx` → `app/summer-afternoon/scene.tsx` | 루트 3D 씬 (공개 제품 진입점) | 없음 (씬 소켓도 익명) |
| `/neighborhood` | `app/neighborhood` | 내 동네 시험판 — 실제 길을 여름 마을 화풍으로 깐 1단계, 반경 200m 사람이 실제 자리에 보인다 (링크는 아직 없음) | 없음 (소켓도 익명) |
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

프록시 계층 구현은 `lib/api/`(client, config, proxy)에 둔다. 리프레시 토큰은 로그인·회원가입·OAuth 콜백·리프레시 라우트가 `refresh_token` httpOnly 쿠키로 설정하고, 로그아웃 라우트가 지운다. PG 결제 웹훅은 BFF를 거치지 않고 API 서버(`POST /billing/webhook`)로 직접 들어간다. 월드 소켓(`/world`)과 씬 소켓(`/scene`)도 브라우저가 `NEXT_PUBLIC_WS_URL`로 직접 붙는다. 이 주소가 localhost인데 페이지가 localhost가 아닌 곳에서 열렸으면(주소 없이 빌드한 배포본) 씬 소켓은 방문자 PC로 붙지 않도록 접속하지 않는다. `app/api/`에 결제·공간·음성 **비즈니스 로직** 추가 금지(프록시 전달만).

---

## React 상태 관리

### 상태 분류 원칙

| 유형 | 위치 | 예시 |
|---|---|---|
| 액세스 토큰 | 브라우저 메모리(`lib/auth/session.ts`, WebSocket 접속에 필요) | Access Token |
| 인증 API 호출 | `lib/api` 프록시 경유(401이면 리프레시 후 한 번 재시도) | 로그인, 리프레시 |
| 지도·타 유저 위치 | socket.io 채널 직접 소비 (`lib/realtime/world.ts`) → `WorldCanvas`의 ref(Map)에 보관 | 실시간 좌표 |
| 같은 방 아이 상태 (루트 3D 씬) | socket.io `/scene` 직접 소비 (`lib/realtime/scene.ts`) → `remotes.ts`가 아이마다 받은 필드를 합쳐 보관 | 위치·방향·모션·색 시드 |
| 가까운 사람 상태 (내 동네) | socket.io `/neighborhood` 직접 소비 (같은 `connectScene`) → 경위도를 내 원점 로컬 m로 바꿔 `remotes.ts`에 보관 | 실제 좌표·방향·모션·색 시드 |
| 가시거리 라이선스 | `/api/me/license` 조회 (상점) | 25m(기본), 100m, 300m |
| 일시적 UI 상태 | `useState` / `useReducer` | 모달 열림, 로딩 |

> 실시간 위치·채팅 이벤트 타입은 `shared/world/contract.ts`(프론트·백엔드 단일 소스)에서 온다. `lib/realtime/world.ts`가 이를 재노출하며, 소비 측(WorldCanvas)은 `lib/realtime/world.ts`에서 import한다. 루트 3D 씬 소켓 타입은 `shared/scene/contract.ts`에서 직접 가져온다.

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
- 키보드 입력은 `window` 리스너로 받는다(루트 3D 씬: 3인칭 컨트롤러 이동·점프, 정보 모달 ESC / 대시보드 월드: `WorldCanvas` 이동). 루트 3D 씬 오디오는 첫 페이지 `click`·캔버스 `pointerup`·`keydown`에서 만들고 음소거를 푼다(전체 볼륨 0.25, 숲·해변 환경음은 캐릭터 x 35~65m로 교차, 발소리는 수평 속도에 비례)
- 3D 캔버스에 `click`/`touchstart` 리스너 직접 바인딩 금지 (백엔드 컨벤션 프론트엔드 하네스)
- 캔버스의 `pointer*`·`mousedown`/`mouseup`(오른쪽 버튼 점프)·`contextmenu` 리스너는 3인칭 컨트롤러(`app/summer-afternoon/thirdPerson.ts`)만 등록하며, 이동·점프 조작 전용이다(예외: 첫 캔버스 `pointerup`은 오디오를 켠다). 오브젝트 선택·팝업 호출에는 쓰지 않는다

---

## 관련 문서

- [ADR 001 — WebGL 컨텍스트 구성](../adr/001-webgl-context-sharing.md)
- [ADR 007 — 카메라 잠금](../adr/007-quarter-view-camera-lock.md)
- [백엔드 컨벤션 — 4대 하네스](../backend/conventions.md)
- [보안 규격 — JWT·RLS](../backend/security/encryption.md)
- [프로젝트 구조](../architecture/project-structure.md)
