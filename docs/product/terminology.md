# 용어 사전

프로젝트에서 사용하는 도메인 용어 정의.

---

## 게임/서비스 용어

| 용어 | 정의 |
|---|---|
| **3D 숲 씬 (Forest Scene)** | 메인 월드. 베이크드 로우폴리 지오메트리로 구성된 단일 Three.js 씬. 오솔길·집·창고·나무·바위·간판·랜드마크가 씬에 구워진 정적/인스턴스 에셋으로 존재한다. 좌표계는 씬 로컬 좌표. |
| **3인칭 추적 카메라 (Third-Person Camera)** | 캐릭터를 뒤에서 따라가며 씬 내 이동을 담는 메인 카메라. |
| **GIS 미니맵 (Minimap)** | 화면 5시(우하단)에 놓인 나침반형 독립 Mapbox GL 캔버스. 유저의 실제 GPS 위치를 실지형 지도 위에 표시하는 보조 뷰. |
| **로우폴리 (Low-Poly)** | 각지고 간결한 폴리곤으로 구성된 3D 스타일. 숲 씬·동물 캐릭터·랜드마크 에셋 전체에 적용. |
| **가시거리 안개 (Fog of War)** | 캐릭터 중심에서 일정 반경 바깥을 덮는 씬의 뷰 디스턴스(거리 안개). 탐험 긴장감과 BM을 연동하는 핵심 메카닉. |
| **가시거리 라이선스** | 씬 뷰 디스턴스 등급을 영구적으로 확장하는 기능 라이선스. 아바타 외형과 완전히 독립된 별도 상품. |
| **이동 조작** | PC는 키보드 WASD, 모바일은 가상 조이스틱으로 씬 내 캐릭터를 이동시킨다. |
| **GPS 위치 표시** | 모바일 GPS 좌표를 5시 GIS 미니맵 위에 실시간 표시한다. 씬 이동을 직접 구동하지 않고 미니맵 전용으로 쓰인다. |
| **오솔길 (Trail)** | 씬 지오메트리에 구워진 길 에셋. 캐릭터는 씬에 놓인 오솔길과 개활지를 걷는다. |
| **랜드마크 (Landmark)** | 숲 속에 존재하는 그루터기·바위·굴·옹달샘 등 자연물 오브젝트. 씬에 배치된 로우폴리 에셋이며, 일부는 B2B 스폰서십 대상(브랜드 텍스처 + 미니맵 좌표 마커)이 된다. |
| **섹터 (Sector)** | 씬 로컬 공간을 일정 크기로 나눈 실시간 브로드캐스트 단위. 섹터별로 socket.io 채널/룸이 존재하며 서버가 섹터 단위로 위치를 묶어 방송한다. |
| **Pre-Join** | 섹터 경계선 50m 전방에서 다음 섹터 socket.io 채널/룸을 미리 구독하여 경계 이동 시 끊김 방지. |

---

## 기술 용어

| 용어 | 정의 |
|---|---|
| **WebGL Context Sharing** | 메인 숲 씬을 단일 Three.js WebGLRenderingContext에서 렌더링하고, 5시 GIS 미니맵은 독립 경량 Mapbox GL 캔버스로 분리 운용하는 방식. 씬 성능을 우선한다. |
| **미니맵 카메라 잠금 (Minimap Camera Lock)** | 5시 GIS 미니맵의 `map.on('move', ...)` 이벤트를 제어해 유저의 드래그·줌 입력을 차단(`dragPan disable`)하고 카메라를 유저 위치에 고정 추적시키는 기법. |
| **GiST 인덱스 (Generalized Search Tree)** | PostGIS 공간 데이터에 적용하는 R-Tree 기반 인덱스. `ST_DWithin` 반경 쿼리를 0.001초 이하로 처리. 미니맵 좌표 레이어를 받친다. |
| **멱등성 키 (Idempotency Key)** | 결제 시 생성하는 주문 UUID. PG사 웹훅이 중복 수신되어도 동일 키를 기준으로 단 1회만 처리되도록 보장. |
| **appearance_hash** | 아바타 외형 파라미터(몸통 색상·패턴·귀 각도·꼬리 각도·악세서리) 조합을 SHA-256으로 해싱한 값. DB UNIQUE 제약으로 외형 겹침을 물리적으로 차단. |
| **Prune / Culling** | 캐릭터 반경 450m 외곽으로 벗어난 Three.js 오브젝트를 메모리에서 해제하는 GC 배치 작업. |
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
| RLS | Row Level Security (PostgreSQL 행 레벨 보안, API 가드 아래 2차 방어) |
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
