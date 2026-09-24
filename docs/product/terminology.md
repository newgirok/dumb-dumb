# 용어 사전

프로젝트에서 사용하는 도메인 용어 정의.

---

## 게임/서비스 용어

| 용어 | 정의 |
|---|---|
| **루트 3D 씬 (Root Scene)** | 루트(`/`)에서 로그인·서버 연결 없이 공개되는 단독 3D 씬(`app/summer-afternoon`). 베이크드 로우폴리 지오메트리를 씬 전용 단일 Three.js 캔버스에 그리며, 좌표계는 씬 로컬 미터 좌표다. |
| **대시보드 월드 (Dashboard World)** | `/dashboard`의 멀티플레이 월드(`components/world/WorldCanvas.tsx`). Mapbox GL Standard 실지형 지도 위에 Three.js 캐릭터를 커스텀 레이어로 얹고, 좌표계는 위경도(EPSG:4326)다. |
| **3인칭 추적 카메라 (Third-Person Camera)** | 루트 3D 씬의 메인 카메라. 시선 목표점(발 위 1.2m) 중심 반경 5.9m·앙각 9.866°에서 캐릭터를 뒤따른다. |
| **쿼터뷰 고정 카메라 (Quarter-View Camera)** | 대시보드 월드의 지도 카메라. pitch 45°·bearing 45°를 고정하고 이동할 때마다 지도 중심을 캐릭터로 맞추며, 줌(14~20)만 허용한다. |
| **GIS 미니맵 (Minimap)** | 루트 3D 씬 화면 5시(우하단)에 놓인 나침반형 독립 Mapbox GL 캔버스. 유저의 실제 GPS 위치를 실지형 지도 위에 표시하는 보조 뷰. |
| **로우폴리 (Low-Poly)** | 각지고 간결한 폴리곤으로 구성된 3D 스타일. 루트 3D 씬 에셋과 캐릭터 전체에 적용. |
| **가시거리 안개 (Fog of War)** | 캐릭터 중심에서 가시거리 반경 바깥을 가리는 메카닉. 탐험 긴장감과 BM을 연동하는 핵심 요소이며, 월드 렌더링 적용은 Phase 5에서 진행한다. |
| **가시거리 라이선스** | 유저별 가시거리 반경(`user_licenses.visibility_radius_m`, 기본 25m)을 영구적으로 확장하는 기능 라이선스. 아바타 외형과 완전히 독립된 별도 상품. |
| **이동 조작** | 루트 3D 씬은 PC WASD·방향키·마우스 가상 조이스틱, 모바일 터치 드래그 가상 조이스틱으로 움직인다. 대시보드 월드는 PC WASD·방향키, 모바일 실제 GPS로 움직인다. |
| **GPS 위치** | 루트 3D 씬에서는 5시 GIS 미니맵의 위치 표시에만 쓰인다. 대시보드 월드에서는 시작 위치를 정하고, 모바일에서는 캐릭터 이동을 직접 구동한다. |
| **도로 스냅 (Road Snap)** | 대시보드 월드에서 새 위치를 15m 이내 Mapbox `road` 레이어 선분의 최근접점으로 보정하는 처리(`lib/map/snap.ts`). |
| **랜드마크 (Landmark)** | 월드에 배치해 브랜드 텍스처를 입히는 B2B 스폰서십 대상 오브젝트. 좌표는 `sponsor_buildings.geom`에 두고, 월드 배치와 미니맵 좌표 마커는 Phase 5에서 붙인다. |
| **섹터 (Sector)** | 대시보드 월드의 실시간 브로드캐스트 단위. 위경도를 500m × 500m 격자로 나누며(위도별 경도 폭), 섹터마다 socket.io 룸과 LiveKit 음성 룸이 있다. 서버가 섹터 단위로 위치를 묶어 방송한다. |
| **Pre-Join** | 섹터 경계 50m 이내에서 인접 섹터 socket.io 룸을 함께 구독하여 경계 이동 시 끊김 방지. |

---

## 기술 용어

| 용어 | 정의 |
|---|---|
| **WebGL 컨텍스트 구성** | 루트 3D 씬은 씬 렌더러와 5시 미니맵 Mapbox 캔버스를 서로 다른 WebGL 컨텍스트로 분리해 씬 성능을 우선한다. 대시보드 월드는 Three.js 렌더러가 Mapbox 캔버스의 WebGL 컨텍스트를 공유(Context Sharing)해 커스텀 레이어로 그린다. |
| **미니맵 카메라 잠금 (Minimap Camera Lock)** | 5시 GIS 미니맵을 `interactive: false`로 만들어 드래그·줌·회전 입력을 모두 차단하고, 줌 16에서 카메라를 유저 GPS 위치에 고정 추적시키는 기법. |
| **GiST 인덱스 (Generalized Search Tree)** | PostGIS 공간 데이터에 적용하는 R-Tree 기반 인덱스. `sponsor_buildings.geom`(geometry)에 걸려 있다. 조회 함수 `nearby_sponsor_buildings`는 `geom::geography` 식으로 조회해 이 인덱스와 식이 달라, 인덱스를 태우려면 geography 표현식 인덱스가 필요하다(Phase 5). |
| **멱등성 키 (Idempotency Key)** | 결제 시 생성하는 주문 UUID. PG사 웹훅이 중복 수신되어도 동일 키를 기준으로 단 1회만 처리되도록 보장. |
| **appearance_hash** | 아바타 외형 파라미터(피부·헤어·헤어 색·상의·상의 색·하의·하의 색·신발·액세서리)와 난수 `seed`를 합쳐 SHA-256으로 해싱한 값. DB UNIQUE 제약이 같은 해시의 중복 발급을 막는다. seed가 해시에 들어가므로 팔레트 조합이 같아도 seed가 다르면 발급된다. |
| **Prune / Culling** | 대시보드 월드에서 50m 이동마다 캐릭터 반경 450m 밖의 피어 오브젝트를 씬에서 빼고, 공유되지 않는 지오메트리와 재질을 해제하는 GC 작업. |
| **Subscription Capping** | LiveKit 음성 구독 대상을 40m 이내 거리 기준 Top-8로 제한하여 클라이언트 CPU·배터리 소모를 방어하는 기법. |
| **음성 감쇠 구간 (Fade Band)** | 근접 음성의 30m(최대 볼륨)~40m(무음) 구간. 이 구간에서 볼륨을 선형으로 줄여, 구독 경계(40m)에 다가갈수록 소리가 자연스럽게 작아지게 한다. |
| **SFU (Selective Forwarding Unit)** | 미디어 중계 서버. P2P 대신 SFU를 경유하여 n명이 모여도 클라이언트가 서버와만 연결하면 되어 O(n) 확장. LiveKit Cloud가 제공. |
| **CPT (Cost Per Time)** | 기간 고정제 광고 과금 방식. 클릭·행동 기반(CPC/CPA) 대신 "특정 랜드마크 1개월 독점"처럼 기간 단위 정가 판매. |

---

## 약어

| 약어 | 풀어쓰기 |
|---|---|
| BM | Business Model |
| PG | Payment Gateway (결제 게이트웨이) |
| RLS | Row Level Security (PostgreSQL 행 레벨 보안, API 가드 아래 2차 방어) |
| GLB | GL Binary (Three.js 3D 모델 포맷, `characters.glb_url`) |
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
