# 프론트엔드 개발 컨벤션

---

## 디자인 시스템

### 테마 — Animal Crossing

Tailwind CSS v4 + `@theme` 블록 기반 커스텀 디자인 시스템. 모든 색상은 `oklch()` 색공간으로 정의한다.

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --font-display: var(--font-display), "Nunito", ui-sans-serif, system-ui, sans-serif;
  --font-mono:    var(--font-mono),    "JetBrains Mono", ui-monospace, monospace;
}
```

### 색상 토큰 (CSS Custom Properties)

| 토큰 | 용도 |
|---|---|
| `--color-paper` | 기본 배경 (크림 화이트) |
| `--color-grass` | 주요 액션 컬러 (초록) |
| `--color-grass-light` | 활성 상태 배경, 테두리 |
| `--color-bark` | 기본 텍스트 (짙은 갈색) |
| `--color-sky` | 보조 배경 (하늘 파랑) |
| `--color-sand` | CTA 섹션 배경 |

모든 토큰은 `app/globals.css`의 `:root` 블록에서 정의하며, `var(--color-*)` 형태로 사용한다.

### 폰트

- **Display / Body**: Nunito (Google Fonts, `next/font/google`)
- **Mono**: JetBrains Mono (코드, 시리얼 번호 등)

```tsx
// app/layout.tsx
import { Nunito, JetBrains_Mono } from 'next/font/google'
const nunito = Nunito({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
```

### 애니메이션 유틸리티 클래스

| 클래스 | 효과 | 용도 |
|---|---|---|
| `.float` | 4초 상하 부유 | 히어로 이모지, UI 강조 요소 |
| `.float-slow` | 6초 상하 부유 | 배경 오브젝트 |
| `.sway` | 5초 좌우 흔들림 | 자연물 (나무, 꽃) |

모든 애니메이션은 `will-change: transform`을 포함해 GPU 가속된다.

### 로그인 페이지 레이아웃

Spot Virtual 스타일 스플릿 레이아웃 (`app/(auth)/login/page.tsx`):

| 영역 | 비율 | 역할 |
|---|---|---|
| 좌측 패널 | 58% (lg 이상만 표시) | `/illustration-login.png` 중앙 정렬 |
| 우측 패널 | 42% | 로그인 폼 (최대 너비 320px) |

버튼·입력창 높이 44px, border-radius 0.5rem, 주요 액션 색상 `#22c55e` 고정.

---

## 메인 월드 — Three.js WebGL 씬 (ADR 001)

메인 월드는 **단일 Three.js WebGL 캔버스**에 렌더링하는 베이크드 로우폴리 3D 숲 씬이다. 오솔길·집·창고·나무·바위·간판·랜드마크는 씬 지오메트리에 구워진 정적/인스턴스 에셋이며, 월드 좌표계는 씬 로컬(위경도 아님)이다. 씬 진입점은 `app/summer-afternoon/`(scene/thirdPerson/audio/rampShader) 계열이다.

### 초기화 규칙

**`lib/map/context.ts`에서만** WebGL 렌더러를 초기화한다. 다른 파일에서 직접 `THREE.WebGLRenderer`를 인스턴스화 금지.

```typescript
// lib/map/context.ts — 단일 진입점
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
```

### 렌더 루프 규칙

- 렌더 루프는 씬 컨텍스트가 소유하는 단일 `requestAnimationFrame` 루프에서만 돈다
- 매 프레임 씬 업데이트 → 3인칭 카메라 갱신 → `renderer.render(scene, camera)` 순서를 지킨다
- 씬 뷰 디스턴스(거리 안개)는 가시거리 등급값에 맞춰 카메라·안개 파라미터로 반영한다

### 오브젝트 생명주기

- 씬에서 제거할 때 반드시 `geometry.dispose()` + `material.dispose()` 쌍으로 호출
- `lib/three/prune.ts`의 `pruneObjects()` 를 통해서만 배치 해제 수행 (직접 dispose 호출 금지)
- GLB 로더는 `lib/three/character.ts` 에서만 인스턴스화 (중복 생성 금지)

---

## 이동·카메라

- **PC**: WASD 키로 캐릭터를 이동한다.
- **모바일**: 가상 조이스틱(`components/hud/Joystick`)으로 이동한다. 모바일 GPS는 5시 미니맵의 실제 위치 표시에만 쓰이고 월드 이동을 직접 구동하지 않는다.
- **카메라**: 3인칭 추적 카메라로 씬 안을 이동한다(`app/summer-afternoon/thirdPerson`). 화면 중심 주체는 캐릭터이며, 이동 좌표는 씬 로컬 좌표다(위치 브로드캐스트·근접 음성·속도 검증 모두 씬 좌표 기준).
- 캐릭터는 씬에 구워진 길 에셋 위를 걷는다.

---

## 5시 GIS 미니맵 — Mapbox GL JS

화면 5시(우하단)에 나침반형 GIS 미니맵을 **독립 경량 Mapbox GL 캔버스**로 띄운다. 유저의 실제 GPS 위치를 실지형 지도 위에 표시하며, 실지형 지도는 미니맵 전용이다(메인 월드의 베이스가 아니다). 미니맵과 메인 씬은 서로 다른 WebGL 컨텍스트로 분리 운용한다(씬 성능 우선).

### 소스·레이어 네이밍 규칙

| 유형 | 패턴 | 예시 |
|---|---|---|
| 소스 | `{domain}-source` | `player-source`, `sponsor-source` |
| 레이어 | `{domain}-{type}-layer` | `sponsor-marker-layer`, `player-dot-layer` |

### 레이어 생명주기

- 레이어 추가는 `map.on('load', () => { ... })` 내부에서만 수행
- 컴포넌트 언마운트·페이지 이동 시 `map.remove()` 반드시 호출
- 미니맵은 유저를 추적해 고정하며, 드래그·줌 조작은 잠근다(`dragPan`/`scrollZoom` disable)

---

## Next.js App Router 라우트 그룹

### 그룹 설계 의도

| 그룹 | 경로 | 목적 | 인증 |
|---|---|---|---|
| `(game)` | `/dashboard`, `/store` | 인게임 대시보드(월드 씬 마운트), 아바타·라이선스 구매 | 필수 |
| `(auth)` | `/login`, `/verify` | 이메일+비밀번호 로그인, 카카오/구글 OAuth | 비인증 진입점 |

3D 월드 씬은 `components/world/WorldCanvas.tsx`가 라우트에 마운트된다.

### 미들웨어 인증 규칙 (`middleware.ts`)

- `(game)` 경로(`/dashboard`, `/store`)는 JWT 유효성 검사 후 진입
- 미인증 요청은 `/login` 으로 리다이렉트
- 인증 로직은 `lib/auth/middleware.ts` 에서 공유

### `app/api/` = BFF 프록시

`app/api/` Route Handler는 브라우저와 NestJS API 사이의 얇은 **BFF 프록시**다. 브라우저는 NestJS를 직접 호출하지 않으며(API 주소 비노출 + CORS 불필요), 프록시가 `Authorization` 헤더를 그대로 전달한다. **비즈니스 로직은 NestJS `apps/api`에 있고, `app/api/`에는 로직을 두지 않는다.**

| 위치 | 프록시 대상 |
|---|---|
| `app/api/auth/*` | 로그인·로그아웃·회원가입·리프레시·OAuth(kakao\|google) |
| `app/api/billing/*` | 상품 조회(`products`), 주문 생성(`orders`) |
| `app/api/me/*` | 내 캐릭터(`characters`), 내 라이선스(`license`) |
| `app/api/voice/token` | LiveKit 룸 토큰 발급 |
| `app/api/health` | 헬스체크 |

프록시 계층 구현은 `lib/api/`(client, config, proxy)에 둔다. `app/api/`에 결제·공간·음성 **비즈니스 로직** 추가 금지(프록시 전달만).

---

## React 상태 관리

### 상태 분류 원칙

| 유형 | 위치 | 예시 |
|---|---|---|
| 액세스 토큰 | 브라우저 메모리(WebSocket 접속에 필요) | Access Token |
| 인증 API 호출 | `lib/api` 프록시 경유 | 로그인, 리프레시 |
| 지도·타 유저 위치 | socket.io 채널 직접 소비 (`lib/realtime/world.ts`) | 실시간 좌표 |
| 가시거리 등급 | JWT Payload 파싱 (`visibility_radius_m`) | 100m, 300m |
| 일시적 UI 상태 | `useState` / `useReducer` | 모달 열림, 로딩 |

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
├── hud/          ← 인게임 HUD (DirectionPad, Joystick, ChatInput)
├── layout/       ← Sidebar, BottomNav
├── world/        ← WorldCanvas (Three.js 월드 씬 + 5시 Mapbox 미니맵)
├── avatar/       ← AvatarCard (아바타 미리보기)
├── transition/   ← PageTransition, CuteLoader
└── ui/           ← 공통 UI (Button, Card, Toast, Spinner)
```

### 캔버스·DOM 이벤트 규칙

- HUD 컴포넌트는 3D 씬 캔버스 위 `pointer-events: none` 영역에 렌더
- HUD 내부 클릭 가능 요소는 `pointer-events: auto` + `stopPropagation()` 처리
- 3D 캔버스에 `click`/`touchstart` 리스너 직접 바인딩 금지 (백엔드 컨벤션 프론트엔드 하네스)

---

## 관련 문서

- [ADR 001 — 메인 씬·미니맵 WebGL 컨텍스트 분리](../adr/001-webgl-context-sharing.md)
- [ADR 007 — 3인칭 추적 카메라 + 미니맵 뷰 잠금](../adr/007-quarter-view-camera-lock.md)
- [백엔드 컨벤션 — 4대 하네스](../backend/conventions.md)
- [보안 규격 — JWT 가시거리 인코딩](../backend/security/encryption.md)
- [프로젝트 구조](../architecture/project-structure.md)
