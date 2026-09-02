# 시스템 아키텍처 개요

파이프라인 상세 흐름은 [파이프라인 흐름](./pipeline-flow.md), 데이터 모델은 [데이터 모델](./data-model.md)을 참고하세요.

---

## 시스템 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                     유저 (브라우저 / 모바일 앱)                    │
│   PC: WASD 이동 (가짜 이동 전용)                                    │
│   모바일: GPS 실제 이동 ↔ 가상 조이스틱 토글                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│           Next.js (App Router, CSR)                              │
│   Mapbox GL JS v3 + Three.js (단일 WebGL 컨텍스트 공유)            │
│   CSS Fog of War (반경 가변 Vignette)                             │
│   배포: Vercel Edge Network                                       │
└───────┬──────────────────────────────────────────┬──────────────┘
        │ Supabase SDK                              │ LiveKit SDK
        │                                          │
┌───────▼──────────────────────────────┐  ┌────────▼─────────────┐
│          Supabase Pro ($25/월)        │  │   LiveKit Cloud      │
│                                      │  │   (매니지드 SFU)      │
│  ┌──────────────────────────────┐    │  │                      │
│  │ PostgreSQL + PostGIS         │    │  │  - 공간 음성 중계     │
│  │  - characters                │    │  │  - 거리 기반 볼륨     │
│  │  - sponsor_buildings(랜드마크)│    │  │  - 3D 오디오 패닝    │
│  │      (GiST)                  │    │  └──────────────────────┘
│  │  - ad_impressions            │    │
│  │  - orders                    │    │
│  └──────────────────────────────┘    │
│  ┌────────────┐  ┌────────────────┐  │
│  │  Auth      │  │  Realtime      │  │
│  │  (OAuth)   │  │  (위치·채팅)   │  │
│  └────────────┘  └────────────────┘  │
│  ┌────────────┐  ┌────────────────┐  │
│  │  Storage   │  │  Edge Functions│  │
│  │  (.glb)    │  │  (결제·쿼리)   │  │
│  └────────────┘  └────────────────┘  │
└──────────────────────────────────────┘
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
 외부 PG사                   Mapbox API
 (토스페이먼츠/카카오페이)     (벡터 타일 → 숲길·랜드마크로 재해석)
 웹훅 → Edge Function
```

---

## 기술 스택

| 분류 | 기술 | 비고 |
|---|---|---|
| **코어 프레임워크** | Next.js (App Router, CSR) | 초기 구동 속도 최적화 |
| **지도 엔진** | Mapbox GL JS v3 | 벡터 타일·지형지물 폴리곤(숲길·랜드마크로 재해석), 무료 티어 20만 건/월 |
| **3D 엔진** | Three.js | 로우폴리 GLB 캐릭터 메시·애니메이션 |
| **렌더링 파이프라인** | WebGL Context Sharing | 단일 canvas, 모바일 60fps ([ADR 001](../adr/001-webgl-context-sharing.md)) |
| **UI 스타일** | Tailwind CSS v4 + 커스텀 디자인 시스템 | 숲·동물 세계관 — Nunito 폰트, oklch 자연 색상 팔레트 |
| **배포** | Vercel Edge Network | 정적 빌드 + GLB 에셋 CDN |
| **데이터베이스** | Supabase Pro (PostgreSQL + PostGIS) | 공간 연산 내장 ([ADR 002](../adr/002-supabase-all-in-one.md)) |
| **실시간 소켓** | Supabase Realtime | 위치·채팅 브로드캐스트 |
| **백엔드 함수** | Supabase Edge Functions | 결제 웹훅, 공간 쿼리 |
| **인증** | Supabase Auth | 이메일 OTP + 카카오 OAuth + Google OAuth |
| **스토리지** | Supabase Storage | GLB 에셋, RLS 보안 |
| **공간 음성** | LiveKit Cloud | 매니지드 SFU ([ADR 003](../adr/003-livekit-cloud-sfu.md)) |
| **PG 결제** | 토스페이먼츠 / 카카오페이 | 원화 직행 ([ADR 004](../adr/004-direct-krw-payment.md)) |

---

## 외부 서비스 의존성

| 서비스 | 용도 | 제한 / 비용 |
|---|---|---|
| **Mapbox** | 지도 타일, 지형지물 폴리곤(숲길·랜드마크) | 무료 20만 건/월, 초과 종량 |
| **Supabase Pro** | DB·Auth·Realtime·Storage·Edge Functions | $25/월 고정 |
| **LiveKit Cloud** | 공간 음성 SFU | 무료 티어 내 소진, 초과분 종량 |
| **토스페이먼츠 / 카카오페이** | 원화 결제 PG | 건당 수수료 |
| **Vercel** | 프론트엔드 배포·CDN | 소규모 무료~소액 고정 |
| **생성형 AI API** | 아바타 외형 조합 (appearance_hash 기반) | 사용량 기반 |

---

## 핵심 아키텍처 상수

| 상수 | 값 | 용도 |
|---|---|---|
| 가시거리 1단계 | 반경 20~30m | 무료 유저 기본 안개 |
| 가시거리 2단계 | 반경 100m | 라이선스 구매 후 |
| 가시거리 3단계 | 반경 300m | 라이선스 구매 후 |
| Three.js Prune 임계값 | 반경 450m 외곽 | 오브젝트 메모리 해제 기준 |
| Prune 트리거 | 50m 이동마다 | 비동기 GC 배치 실행 |
| 에셋 프리로드 바운더리 | 전방 350~400m | 스폰서 텍스처 사전 다운로드 |
| 가짜 이동 반경 락 | 기준점에서 1km | 무료 유저 Mapbox 타일 소모 방어 |
| 오솔길 스냅 임계값 | 15m 이내 | 가장 가까운 오솔길로 자석 정렬 |
| 캐릭터 최대 이동 속도 | 시속 30km | 텔레포트/핵 패킷 드롭 기준 |
| 음성 활성 반경 | 30m | LiveKit 룸 조인 기준 |
| 음성 파기 반경 | 40m | LiveKit disconnect 기준 |
| 동시 구독 Capping | Top-8 | 클라이언트 CPU 방어 |
| 카메라 Pitch | 45~50° | 고정 |
| 카메라 Bearing | 45° | 고정 |
| 줌 레벨 | 16~17 | 고정 (숲길 수준) |

---

## 비용 목표

**월 고정비 약 3.5만 원 이하**

| 항목 | 예상 비용 |
|---|---|
| Supabase Pro | $25 (~35,000원) |
| LiveKit Cloud (MVP 무료 티어) | $0 |
| Vercel (소규모 트래픽) | $0~소액 |
| Mapbox (20만 건/월 무료 티어 내) | $0 |
| **합계** | **~35,000원/월** |

---

## 관련 ADR

| ADR | 주제 |
|---|---|
| [ADR 001](../adr/001-webgl-context-sharing.md) | Mapbox + Three.js 단일 WebGL 컨텍스트 |
| [ADR 002](../adr/002-supabase-all-in-one.md) | Supabase 통합 백엔드 허브 |
| [ADR 003](../adr/003-livekit-cloud-sfu.md) | LiveKit Cloud 매니지드 SFU |
| [ADR 004](../adr/004-direct-krw-payment.md) | 원화 직행 결제 구조 |
| [ADR 005](../adr/005-postgis-gist-index.md) | PostGIS + GiST 공간 인덱스 |
| [ADR 006](../adr/006-fog-of-war-business-model.md) | Fog of War BM 연동 |
| [ADR 007](../adr/007-quarter-view-camera-lock.md) | 쿼터뷰 카메라 잠금 |
