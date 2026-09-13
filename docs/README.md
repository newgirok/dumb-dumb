# 3D 오픈월드 소셜 — 문서 허브

베이크드 로우폴리 3D 숲 씬 속에서 유니크 동물 캐릭터를 조종하며 다른 동물 캐릭터와 우연히 마주치고 커뮤니티를 형성하는 오픈월드 소셜 서비스. 화면 5시에는 유저의 실제 GPS 위치를 보여주는 GIS 미니맵이 함께 뜬다.

**GitHub**: https://github.com/newgirok/open-world-casual-journey

---

## 빠른 시작

로컬 개발 환경 세팅은 [로컬 환경 세팅 가이드](./onboarding/local-setup.md)를 참고하라.

프론트엔드와 API 서버(`apps/api`)를 각각 기동하고, `.env.local` 두 개(루트 프론트엔드, `apps/api`)를 준비한다.

```bash
# 1. 환경변수 설정 (프론트엔드 + API 서버)
cp .env.example .env.local
cp apps/api/.env.example apps/api/.env.local

# 2. PostgreSQL 마이그레이션 적용 (supabase/migrations/ SQL을 순서대로)
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql   # 이후 0002~ 순차 적용

# 3. API 서버 기동 (apps/api)
cd apps/api && npm install && npm run start:dev

# 4. 프론트엔드 기동 (루트)
npm install && npm run dev
```

Docker Compose로 프론트엔드를 컨테이너에서 기동할 수도 있다(`docker compose up`, `WATCHPACK_POLLING=true` 핫 리로드). 환경변수 항목별 설명은 [환경변수 가이드](./onboarding/env-vars.md)를 확인하라.

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
| [로드맵](./roadmap.md) | Phase 0~6 개발 계획 |

### 온보딩 가이드

| 문서 | 설명 |
|---|---|
| [클라우드 인프라 초기 셋업](./onboarding/infra-setup.md) | Vercel, LiveKit, 오브젝트 스토리지 최초 1회 설정 |
| [로컬 환경 세팅](./onboarding/local-setup.md) | Node.js, PostgreSQL, 프론트엔드 + API 서버 초기 설정 |
| [API 키 설정](./onboarding/api-keys.md) | Mapbox, LiveKit, PG사, OAuth 키 발급 방법 |
| [환경변수 레퍼런스](./onboarding/env-vars.md) | 전체 환경변수 목록 및 설명 |
| [개발 명령어](./onboarding/commands.md) | npm / psql / Docker 명령어 레퍼런스 |

### 프론트엔드 개발

| 문서 | 설명 |
|---|---|
| [프론트엔드 컨벤션](./frontend/conventions.md) | Three.js 월드 씬, 이동·3인칭 카메라, 5시 Mapbox 미니맵, App Router 라우트 설계, BFF 프록시, 상태 관리 |

### 백엔드 개발

| 문서 | 설명 |
|---|---|
| [개발 컨벤션](./backend/conventions.md) | API 설계 원칙, NestJS 모듈 구조, 공간 쿼리 규칙, socket.io 게이트웨이 |
| [보안 규격](./backend/security/encryption.md) | JWT 구조, 토큰 이중 구조, RLS, 가시거리 라이선스 인코딩 |

### 테스트

| 문서 | 설명 |
|---|---|
| [테스트 전략](./testing/strategy.md) | Phase별 완료 기준, 단위·통합·부하 테스트 시나리오 |

### 운영 가이드

| 문서 | 설명 |
|---|---|
| [배포 절차](./operations/runbook/deploy.md) | 로컬 → Vercel / API 서버 프로덕션 배포 단계 |
| [모니터링](./operations/monitoring.md) | Mapbox·LiveKit·서버 비용 알림 및 대시보드 |
| [과금 방어 대응](./operations/runbook/billing-guard.md) | API 과금 폭탄 원인 및 즉시 차단 절차 |

---

## 핵심 명령어

```bash
# 프론트엔드 (루트)
npm run dev          # next dev --turbopack
npm run build
npm run type-check

# API 서버 (apps/api)
cd apps/api
npm run start:dev    # watch 모드
npm run build
npm run start:prod
npm run type-check

# DB 마이그레이션 (supabase/migrations/ SQL 순차 적용)
psql "$DATABASE_URL" -f supabase/migrations/0002_users.sql

# Docker Compose 프론트엔드 개발 서버
docker compose up
```

---

## 현재 Phase 상태

| Phase | 목표 | 상태 |
|---|---|---|
| Phase 0 | 프로젝트 초기화 및 인프라 셋업 | 완료 |
| Phase 1 | UI/UX 기반 구축 (인증 플로우, HUD, 공통 컴포넌트) | 완료 |
| Phase 2 | 섹터 이동 + socket.io 실시간 위치 동기화 | 완료 |
| Phase 3 | LiveKit 공간 음성 자동 연결 (반경 30m) | 완료 |
| Phase 4 | 인앱 결제 + 아바타 발급 + 가시거리 라이선스 | 완료 |
| Phase 5 | B2B 스폰서십 광고(브랜드 텍스처 에셋 + 미니맵 마커) + 광고주 포탈 | 예정 |
| Phase 6 | 상용화 (프로덕션 부하 테스트, 동접 200명) | 예정 |

---

## 인프라 비용 목표

자체 호스팅 기준. DB/API 서버 호스팅 + Mapbox(무료 티어 내) + LiveKit Cloud(무료 티어 내) + Vercel(소규모 무료~소액)로 구성한다. 상세 항목은 [아키텍처 개요 — 비용 목표](./architecture/overview.md#비용-목표)를 확인하라.
