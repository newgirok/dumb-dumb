# 지도 기반 쿼터뷰 오픈월드 — 문서 허브

실제 지형 위에 펼쳐진 숲 속에서 유니크 로우폴리 동물 캐릭터를 조종하며 다른 동물 캐릭터와 우연히 마주치고 커뮤니티를 형성하는 오픈월드 소셜 서비스.

**GitHub**: https://github.com/newgirok/openworld

---

## 빠른 시작

로컬 개발 환경 세팅은 [로컬 환경 세팅 가이드](./onboarding/local-setup.md)를 참고하라.

```bash
# 1. 환경변수 설정 (Supabase Cloud 키 입력)
cp .env.example .env.local

# 2. Docker Compose로 개발 서버 기동
docker compose down -v && docker compose up --build -d
```

환경변수 항목별 설명은 [환경변수 가이드](./onboarding/env-vars.md)를 확인하라.

---

## 주요 문서

| 문서 | 설명 |
|---|---|
| [아키텍처 개요](./architecture/overview.md) | 시스템 전체 구조, 기술 스택, 외부 의존성, 비용 |
| [파이프라인 흐름](./architecture/pipeline-flow.md) | 결제·광고 노출·이동 등 핵심 데이터 흐름 |
| [데이터 모델](./architecture/data-model.md) | PostgreSQL + PostGIS 스키마 및 ER 다이어그램 |
| [프로젝트 구조](./architecture/project-structure.md) | 디렉토리 트리 및 파일별 역할 |
| [ADR 목록](./adr/README.md) | 주요 기술 결정 기록 7개 |
| [비즈니스 규칙](./product/business-rules.md) | 결제·광고·가시거리 라이선스 핵심 도메인 규칙 |
| [용어 사전](./product/terminology.md) | 프로젝트 도메인 용어 정의 |
| [PRD](./prd.md) | 제품 요구사항 문서 |
| [로드맵](./roadmap.md) | Phase 0~7 개발 계획 |

### 온보딩 가이드

| 문서 | 설명 |
|---|---|
| [클라우드 인프라 초기 셋업](./onboarding/infra-setup.md) | Supabase Cloud, Vercel, LiveKit 최초 1회 설정 |
| [로컬 환경 세팅](./onboarding/local-setup.md) | Supabase CLI, Node.js, Next.js 초기 설정 |
| [API 키 설정](./onboarding/api-keys.md) | Mapbox, Supabase, LiveKit, PG사 키 발급 방법 |
| [환경변수 레퍼런스](./onboarding/env-vars.md) | 전체 환경변수 목록 및 설명 |
| [개발 명령어](./onboarding/commands.md) | npm / Supabase CLI / Docker 명령어 레퍼런스 |

### 프론트엔드 개발

| 문서 | 설명 |
|---|---|
| [프론트엔드 컨벤션](./frontend/conventions.md) | Mapbox 레이어 관리, Three.js WebGL 패턴, App Router 라우트 설계, 상태 관리 |

### 백엔드 개발

| 문서 | 설명 |
|---|---|
| [개발 컨벤션](./backend/conventions.md) | API 설계 원칙, 공간 쿼리 규칙, 결제 예외 처리 |
| [보안 규격](./backend/security/encryption.md) | JWT 구조, 토큰 서명, 가시거리 라이선스 인코딩 |

### 테스트

| 문서 | 설명 |
|---|---|
| [테스트 전략](./testing/strategy.md) | Phase별 완료 기준, 단위·통합·부하 테스트 시나리오 |

### 운영 가이드

| 문서 | 설명 |
|---|---|
| [배포 절차](./operations/runbook/deploy.md) | 로컬 → Vercel / Supabase 프로덕션 배포 단계 |
| [모니터링](./operations/monitoring.md) | Mapbox·Supabase·LiveKit 비용 알림 및 대시보드 |
| [과금 방어 대응](./operations/runbook/billing-guard.md) | API 과금 폭탄 원인 및 즉시 차단 절차 |

---

## 핵심 명령어

```bash
# Docker Compose 개발 서버 기동 (패키지 변경 후)
docker compose down -v && docker compose up --build -d

# 개발 서버 로그 확인
docker compose logs -f

# DB 마이그레이션 적용
supabase db push --linked

# Edge Functions 배포
supabase functions deploy

# 전체 빌드
npm run build

# 타입 체크
npm run type-check
```

---

## 현재 Phase 상태

| Phase | 목표 | 상태 |
|---|---|---|
| Phase 0 | 프로젝트 초기화 및 인프라 셋업 | 완료 |
| Phase 1 | UI/UX 기반 구축 (인증 플로우, HUD, 공통 컴포넌트) | 완료 |
| Phase 2 | 단일 섹터 이동 + Supabase Realtime 위치 동기화 | 예정 |
| Phase 3 | 멀티 섹터 Pre-Join + PostGIS 영구 저장 | 예정 |
| Phase 4 | LiveKit Cloud 공간 음성 자동 연결 (반경 30m) | 예정 |
| Phase 5 | 인앱 결제 + 가시거리 라이선스 발급 파이프라인 | 예정 |
| Phase 6 | B2B 스폰서십 광고 구좌 + Fog of War 연동 | 예정 |
| Phase 7 | 상용화 (프로덕션 부하 테스트, 동접 200명) | 예정 |

---

## 인프라 비용 목표

월 고정비 **약 3.5만 원** (Supabase Pro $25 + LiveKit Cloud 무료 티어). 상세 항목은 [아키텍처 개요 — 비용 목표](./architecture/overview.md#비용-목표)를 확인하라.
