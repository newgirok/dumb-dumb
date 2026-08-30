# 제품 요구사항 문서 (PRD) — 요약

> 원본: `PRD_지도기반_쿼터뷰_오픈월드_서비스_v1.0.md` (v1.6 최종본)  
> 목적: 1인 개발 + AI 개발 툴 활용 프로토타입 빌드용 마스터 명세서

---

## 서비스 한 줄 정의

유저가 캐릭터를 조종하여 실제 존재하는 동네 골목길을 누비고 탐험하는 **위치 기반 오픈월드 소셜 서비스**.

- **비주얼**: 45도 고정 쿼터뷰 + 로우폴리(Low-Poly) 스타일, 기본 테마는 네이처 펑크(숲)
- **지원 환경**: PC 웹 브라우저 + 모바일 앱 하이브리드

---

## Part 1. 핵심 제품 명세

### 플레이 모드

| 기기 | 모드 | 조작 |
|---|---|---|
| PC 웹 | 가짜 이동 전용 | 키보드 WASD |
| 모바일 | 실제 이동 (GPS) / 가짜 이동 토글 | GPS 추적 / 가상 조이스틱 |

### 카메라 규칙

- Pitch 45~50도 고정, Bearing 45도 고정 (X자 격자 시야)
- 유저의 드래그·줌 조작 전면 차단 (`Camera Hijack`)
- 모바일 자이로 센서: 15도 이하 변위 무시, 초과 시 0.2초 Lerp 적용

### 가시거리(Fog of War) 등급

| 등급 | 반경 | 구분 |
|---|---|---|
| 기본 (무료) | 20~30m | 최초 가입 유저 |
| 2단계 | 100m | 가시거리 라이선스 구매 |
| 3단계 | 300m | 가시거리 라이선스 구매 |

---

## Part 2. 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| 코어 프레임워크 | Next.js (App Router, CSR) | |
| 지도 엔진 | Mapbox GL JS v3 | 벡터 타일, 건물 폴리곤 |
| 3D 엔진 | Three.js | 로우폴리 GLB 캐릭터 렌더링 |
| 렌더링 파이프라인 | WebGL Context Sharing | 단일 canvas, 모바일 60fps |
| 프론트엔드 배포 | Vercel | Edge Network CDN |
| 스토리지 | Supabase Storage | GLB 에셋, RLS 보안 |
| 백엔드 함수 | Supabase Edge Functions | 서버리스, 자동 스케일 |
| 데이터베이스 | Supabase Pro ($25/월) | PostgreSQL + PostGIS 내장 |
| 실시간 소켓 | Supabase Realtime | 위치·채팅 브로드캐스트 |
| 인증 | Supabase Auth | 이메일 OTP + 카카오 OAuth + Google OAuth |
| 공간 음성 | LiveKit Cloud | 매니지드 SFU, 무료 티어 |

월 고정비: **약 3.5만 원** ($25 Supabase Pro + LiveKit 무료 티어 범위)

---

## Part 3. 수익 모델 (Business Model)

### 인앱 결제 — 원화 직행

```
[원화 결제] → [카카오페이 / 토스페이 / 신용카드] → 즉시 확정 지급
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
  상품 1: 3D 아바타 (2,200원)     상품 2: 가시거리 라이선스 (정가)
  → AI 조합 100% 유니크 발급       → 기능성 시야 확장 권한
```

- 확률형 아이템 없음, 100% 확정 발급
- 유저 간 NFT/P2P 거래 없음, 순수 인앱 귀속
- 10개 패키지 (19,000원) = 아바타 10종 + 가시거리 2단계 번들

### B2B 공간 스폰서십 (CPT 모델)

- 실제 건물 좌표에 브랜드 텍스처 매핑 (기간 고정제 정가 판매)
- 무료 유저 시야 경계(35m 지점)에 스폰서 건물 실루엣 노출 → 결제 유도

---

## Part 4. 데이터 모델 핵심

### characters 테이블

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `serial_number` | VARCHAR(32) UNIQUE | 유저 노출용 시리얼 (`Dog #3,491`) |
| `owner_id` | UUID FK | Supabase Auth 유저 |
| `appearance_hash` | CHAR(64) UNIQUE | 외형 조합 SHA-256 해시 (겹침 방지) |
| `created_at` | TIMESTAMPTZ | 결제 완료 시각 |

### sponsor_buildings 테이블

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `geom` | GEOMETRY(Point, 4326) | 건물 위치 (GiST 인덱스 필수) |
| `texture_url` | TEXT | 브랜드 로고 URL |
| `advertiser_id` | UUID FK | 광고주 계정 |
| `starts_at` / `ends_at` | TIMESTAMPTZ | 광고 집행 기간 |

---

## Part 5. 유저 이벤트 흐름

```
[최초 접속]
  → 이메일 OTP 인증 또는 소셜 OAuth (카카오·구글) → 약관 동의
  → 기본 캐릭터 + 가시거리 1단계 자동 귀속

[로그인]
  → JWT 자가 검증 (15분 Access + 14일 Refresh)
  → 3D 월드 로딩 (WebGL 컨텍스트 믹싱)
  → 안전 경고 팝업 (3초 Dim)

[인게임 루프]
  → 조이스틱/WASD 이동 → 도로 스냅 → Realtime 위치 브로드캐스트
  → 가시거리 경계 안개 렌더링
  → B2B 스폰서 건물 감지 (PostGIS ST_DWithin) → 노출 카운팅

[상점 트랜잭션]
  → 원화 결제 → 멱등성 키 검증 → 캐릭터/라이선스 발급
  → 실패 시 자동 환불 롤백

[로그아웃]
  → Three.js dispose() → GPS 세션 파기 → Auth 토큰 폐기
```

---

## Part 6. UI/UX 원칙

- 지도가 아닌 **캐릭터(나)** 가 화면의 중심 주체
- 3D 공간 광고만 허용, 2D 팝업 배너 전면 금지
- 건물 클릭 시 팝업 없음 — 캐릭터 절레절레 No-Action 애니메이션으로 대응
- Animal Crossing 감성 디자인 — Nunito 폰트, oklch 자연 색상 팔레트, 물리적 무게감 있는 라운드 카드 UI

---

## Part 7. 멀티플레이어 음성 & 채팅

- **공간 음성**: LiveKit Cloud SFU, 거리 기반 볼륨 감쇠 + 3D 오디오 패닝
- **근접 반경**: 30m 이내 진입 시 룸 자동 연결, 40m 이탈 시 즉시 파기
- **동시 구독 제한**: 거리 기준 Top-8 트랙만 구독 (Subscription Capping)
- **채팅**: Supabase Realtime 무상태 소켓, DB 저장 없음, 7초 후 자동 페이드아웃

---

## 관련 문서

- [아키텍처 개요](./architecture/overview.md)
- [비즈니스 규칙](./product/business-rules.md)
- [데이터 모델](./architecture/data-model.md)
- [로드맵](./roadmap.md)
