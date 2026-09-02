# 용어 사전

프로젝트에서 사용하는 도메인 용어 정의.

---

## 게임/서비스 용어

| 용어 | 정의 |
|---|---|
| **쿼터뷰 (Quarter View)** | 45도 각도에서 대각선으로 내려다보는 고정 시점. 클래식 RPG 방식으로 Pitch 45~50°, Bearing 45° 고정. |
| **로우폴리 (Low-Poly)** | 각지고 간결한 폴리곤으로 구성된 3D 스타일. 동물 캐릭터·랜드마크 에셋 전체에 적용. |
| **가시거리 안개 (Fog of War)** | 캐릭터 중심에서 일정 반경 바깥을 덮는 짙은 숲 안개. 탐험 긴장감과 BM을 연동하는 핵심 메카닉. |
| **가시거리 라이선스** | 가시거리 안개를 영구적으로 확장하는 기능 라이선스. 아바타 외형과 완전히 독립된 별도 상품. |
| **실제 이동 모드** | 스마트폰 GPS를 이용해 야외에서 실제로 걷는 속도에 맞춰 캐릭터가 이동하는 모드. |
| **가짜 이동 모드** | 실내에서 가상 조이스틱(모바일) 또는 WASD 키보드(PC)로 캐릭터를 시뮬레이션 이동하는 모드. |
| **오솔길 스냅 (Snap-to-Trail)** | GPS 오차 또는 이동 경로 이탈 시 가장 가까운 오솔길 중심선으로 캐릭터를 자동 정렬하는 보정. |
| **랜드마크 (Landmark)** | 숲 속에 존재하는 그루터기·바위·굴·옹달샘 등 자연물 오브젝트. 기술적으로는 Mapbox의 건물 폴리곤 데이터를 재해석해 배치하며, 일부는 B2B 스폰서십 대상이 된다. |
| **섹터 (Sector)** | 지도를 일정 크기(예: 0.005° × 0.005°)로 나눈 실시간 브로드캐스트 단위. 섹터별로 Realtime 채널이 존재. |
| **Pre-Join** | 섹터 경계선 50m 전방에서 다음 섹터 Realtime 채널을 미리 구독하여 경계 이동 시 끊김 방지. |

---

## 기술 용어

| 용어 | 정의 |
|---|---|
| **WebGL Context Sharing** | Mapbox GL JS의 WebGLRenderingContext를 Three.js가 공유하여 단일 `<canvas>`에서 두 엔진이 공존하는 방식. VRAM 버퍼 복사 제로. |
| **Camera Hijack** | `map.on('move', ...)` 이벤트와 `requestAnimationFrame` 루프를 탈취해 유저의 드래그·줌 입력을 차단하고 카메라 매트릭스를 강제 고정하는 기법. |
| **GiST 인덱스 (Generalized Search Tree)** | PostGIS 공간 데이터에 적용하는 R-Tree 기반 인덱스. `ST_DWithin` 반경 쿼리를 0.001초 이하로 처리. |
| **멱등성 키 (Idempotency Key)** | 결제 시 생성하는 주문 UUID. PG사 웹훅이 중복 수신되어도 동일 키를 기준으로 단 1회만 처리되도록 보장. |
| **appearance_hash** | 아바타 외형 파라미터(몸통 색상·패턴·귀 각도·꼬리 각도·악세서리) 조합을 SHA-256으로 해싱한 값. DB UNIQUE 제약으로 외형 겹침을 물리적으로 차단. |
| **Prune / Culling** | 캐릭터 반경 450m 외곽으로 벗어난 Three.js 오브젝트와 Mapbox 타일을 메모리에서 해제하는 GC 배치 작업. |
| **Subscription Capping** | LiveKit 음성 구독 대상을 거리 기준 Top-8로 제한하여 클라이언트 CPU·배터리 소모를 방어하는 기법. |
| **Hysteresis Buffer** | Top-N 경계 부근에서 구독·해제가 반복(Flapping)되는 현상을 막기 위한 진입/이탈 임계값 2단계 여유 구간. |
| **SFU (Selective Forwarding Unit)** | 미디어 중계 서버. P2P 대신 SFU를 경유하여 n명이 모여도 클라이언트가 서버와만 연결하면 되어 O(n) 확장. LiveKit Cloud가 제공. |
| **CPT (Cost Per Time)** | 기간 고정제 광고 과금 방식. 클릭·행동 기반(CPC/CPA) 대신 "특정 랜드마크 1개월 독점"처럼 기간 단위 정가 판매. |

---

## 약어

| 약어 | 풀어쓰기 |
|---|---|
| BM | Business Model |
| PG | Payment Gateway (결제 게이트웨이) |
| RLS | Row Level Security (Supabase DB 접근 격리) |
| GLB | GL Binary (Three.js 3D 모델 포맷) |
| GPS | Global Positioning System |
| JWT | JSON Web Token |
| GC | Garbage Collection |
| UV | UV Mapping (3D 텍스처 좌표계) |
| ADR | Architecture Decision Record |

---

## 관련 문서

- [PRD](../prd.md)
- [비즈니스 규칙](./business-rules.md)
- [아키텍처 개요](../architecture/overview.md)
