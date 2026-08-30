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
│   ├── store/page.tsx            ← 상점 (아바타·라이선스 구매, 인증 필수)
│   ├── admin/                    ← B2B 광고주 어드민 포탈 (role: advertiser 전용)
│   │   ├── buildings/page.tsx    ← 건물 좌표 선택 + 텍스처 업로드
│   │   └── impressions/page.tsx  ← 노출 통계 대시보드
│   └── api/                      ← Next.js Route Handler (헬스체크 전용)
│       └── health/route.ts       ← 비즈니스 로직 금지, Edge Functions 사용
│
├── components/                   ← 공유 React 컴포넌트
│   ├── hud/                      ← 인게임 HUD (방향키, 조이스틱, 채팅 입력)
│   ├── avatar/                   ← 아바타 선택·미리보기 카드
│   ├── store/                    ← 결제 모달, 상품 카드
│   └── ui/                       ← 공통 UI (버튼, 카드, 토스트)
│
├── lib/                          ← 클라이언트 공유 로직
│   ├── supabase/
│   │   ├── client.ts             ← 브라우저용 Supabase 클라이언트
│   │   └── server.ts             ← 서버·미들웨어용 Supabase 클라이언트
│   ├── map/
│   │   ├── context.ts            ← WebGL Context Sharing 초기화 (단일 진입점)
│   │   ├── camera.ts             ← Camera Hijack + 카메라 잠금
│   │   └── snap.ts               ← 도로 스냅 알고리즘
│   ├── three/
│   │   ├── character.ts          ← GLB 로드 + Walk/Idle 애니메이션
│   │   ├── fog.ts                ← Fog of War CSS Vignette 제어
│   │   ├── billboard.ts          ← 말풍선 lookAt 빌보드 연산
│   │   └── prune.ts              ← 반경 450m 외곽 dispose() 배치
│   ├── realtime/
│   │   ├── position.ts           ← Supabase Realtime 위치 브로드캐스트
│   │   └── chat.ts               ← 무상태 공간 채팅 라우팅
│   ├── voice/
│   │   ├── livekit.ts            ← LiveKit 룸 조인·파기
│   │   └── spatial-audio.ts     ← 볼륨 감쇠 + 3D 패닝
│   ├── payment/
│   │   ├── order.ts              ← 주문 UUID 생성 + 상태 폴링
│   │   └── idempotency.ts        ← 멱등성 키 관리
│   ├── geo/
│   │   ├── validator.ts          ← 클라이언트 속도 검증 (30km/h 드롭)
│   │   └── sector.ts             ← 섹터 경계 Pre-Join 로직
│   └── auth/
│       ├── session.ts            ← JWT 파싱 + 토큰 갱신 헬퍼
│       └── middleware.ts         ← 라우트 보호 미들웨어 로직
│
├── supabase/
│   ├── functions/                ← Edge Functions (각 함수: index.ts + handler.ts + types.ts)
│   │   ├── payment-webhook/      ← PG사 웹훅 처리 + 캐릭터 발급
│   │   ├── spatial-query/        ← 반경 내 스폰서 건물 탐지
│   │   ├── livekit-token/        ← LiveKit 룸 토큰 발급
│   │   └── impression-log/       ← 유효 노출 카운팅
│   └── migrations/               ← DB 마이그레이션 SQL
│       ├── 0001_init.sql         ← 초기 스키마
│       ├── 0002_characters.sql   ← characters + orders 테이블
│       ├── 0003_sponsor.sql      ← sponsor_buildings + GiST 인덱스
│       └── 0004_impressions.sql  ← ad_impressions 테이블
│
├── public/
│   ├── illustration-login.png    ← 로그인 화면 좌측 패널 일러스트 (Animal Crossing 스타일)
│   └── assets/
│       └── characters/           ← 기본 캐릭터 GLB 플레이스홀더 (구매 캐릭터는 Supabase Storage 제공)
│
├── docs/                         ← 이 문서 허브
├── middleware.ts                 ← Next.js 전역 미들웨어 (lib/auth/middleware.ts 호출)
├── .env.example                  ← 환경변수 템플릿
├── next.config.ts
└── package.json
```

---

## 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `lib/map/context.ts` | Mapbox WebGLContext를 Three.js에 공유하는 유일한 초기화 진입점 ([ADR 001](../adr/001-webgl-context-sharing.md)) |
| `lib/map/camera.ts` | `dragPan.disable()` + `move` 이벤트 강제 리셋 ([ADR 007](../adr/007-quarter-view-camera-lock.md)) |
| `lib/three/fog.ts` | 유저 가시거리 등급에 따른 CSS Vignette 반경 계산·적용 |
| `lib/three/prune.ts` | 50m 이동마다 반경 450m 외곽 오브젝트 `geometry.dispose()` 배치 |
| `lib/geo/validator.ts` | 직전 좌표 대비 이동 속도 계산 → 30km/h 초과 시 좌표 드롭 |
| `lib/auth/session.ts` | JWT Payload 파싱 (`visibility_radius_m` 추출) + Access Token 갱신 |
| `lib/auth/middleware.ts` | `(game)`, `store`, `admin` 라우트 인증 검사 + 광고주 Role 검증 |
| `supabase/functions/payment-webhook/` | PG 웹훅 수신 → 멱등성 검증 → 캐릭터 발급 → 실패 시 자동 환불 |
| `supabase/functions/spatial-query/` | `ST_DWithin` 쿼리로 반경 내 스폰서 건물 목록 반환 |

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [프론트엔드 컨벤션](../frontend/conventions.md)
- [백엔드 컨벤션 — Edge Functions 파일 구조](../backend/conventions.md)
- [온보딩 — 개발 명령어](../onboarding/commands.md)
