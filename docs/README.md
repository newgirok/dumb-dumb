# Dumb Dumb (3D 소셜) — 문서 허브

반려동물을 목줄로 데리고 다니는 반려인(유니크 3D 아바타)을 조종하며 다른 유저와 우연히 마주치고 커뮤니티를 형성하는 3D 소셜 서비스. 루트(`/`)는 플레이·내 주변·에셋 미리보기 버튼을 세로로 쌓은 게임 타이틀 화면(선택 페이지)이다. `/play`(플레이 씬)는 로그인 없이 공개되는 3D 씬으로, 같은 방(최대 20명)에 든 다른 방문자의 캐릭터가 익명으로 함께 보이고, 가까이 마주친 사람과는 서로 받아들이면 1:1로 글을 주고받으며(만남 대화), 우상단 지도 버튼이나 M 키로 유저의 실제 GPS 위치를 보여 주는 펼침 지도를 펼친다. `/nearby`(내 주변(베타))는 위치를 받을 때까지 기다렸다가 같은 화풍으로 내 위치 주변 실제 길을 깔아 걷는 만큼 이어 깔고, 반경 200m 안 사람의 캐릭터를 실제 자리에 보여 준다. `/asset-viewer`는 ref-assets 규격을 확인하는 개발용 에셋 미리보기다. 로그인·상점 화면과, Mapbox 실지형 지도 위에서 위치를 실시간으로 공유하는 맵은 예정이다.

**GitHub**: https://github.com/newgirok/dumb-dumb

---

## 빠른 시작

로컬 개발 환경 세팅은 [로컬 환경 세팅 가이드](./onboarding/local-setup.md)를 참고하라.

프론트엔드·실시간 서버(`apps/realtime`)·API 서버(`apps/api`)를 각각 기동하고, `.env.local` 두 개(루트 프론트엔드, `apps/api`)를 준비한다(실시간 서버는 설정 없이 뜬다).

```bash
# 1. 환경변수 설정 (프론트엔드 + API 서버)
cp .env.example .env.local
cp apps/api/.env.example apps/api/.env.local

# 2. PostgreSQL 마이그레이션 적용 (관리 롤로, apps/api/migrations/ SQL을 번호 순서대로)
#    0000이 auth.users 스텁을 만든다. 적용 뒤 app_api 로그인을 켠다 (onboarding/local-setup.md 3장)
for f in apps/api/migrations/*.sql; do psql -v ON_ERROR_STOP=1 "$DATABASE_URL_ADMIN" -f "$f"; done

# 3. 실시간 서버 기동 (apps/realtime, 9002 — DB·환경변수 없이 뜬다)
cd apps/realtime && npm install && npm run start:dev

# 4. API 서버 기동 (apps/api, 9001)
cd apps/api && npm install && npm run start:dev

# 5. 프론트엔드 기동 (루트)
npm install && npm run dev
```

Docker Compose로 프론트엔드(프로덕션 빌드)와 실시간 서버를 컨테이너로 띄울 수도 있다(`docker compose --env-file .env.local up -d --build` — `app`과 `realtime`이 함께 뜬다). 핫 리로드 개발은 호스트의 `npm run dev`로 한다. 환경변수 항목별 설명은 [환경변수 가이드](./onboarding/env-vars.md)를 확인하라.

---

## 주요 문서

| 문서 | 설명 |
|---|---|
| [아키텍처 개요](./architecture/overview.md) | 시스템 전체 구조, 기술 스택, 외부 의존성, 비용 |
| [파이프라인 흐름](./architecture/pipeline-flow.md) | 결제·이동·위치 동기화 등 핵심 데이터 흐름 |
| [데이터 모델](./architecture/data-model.md) | PostgreSQL + PostGIS 스키마 및 ER 다이어그램 |
| [프로젝트 구조](./architecture/project-structure.md) | 디렉토리 트리 및 파일별 역할 |
| [ADR 목록](./adr/README.md) | 주요 기술 결정 기록 10개 |
| [비즈니스 규칙](./product/business-rules.md) | 결제·광고·가시거리 라이선스 핵심 도메인 규칙 |
| [용어 사전](./product/terminology.md) | 프로젝트 도메인 용어 정의 |
| [PRD](./prd.md) | 제품 요구사항 문서 |
| [로드맵](./roadmap.md) | Phase 1~5 개발 계획 |

### 온보딩 가이드

| 문서 | 설명 |
|---|---|
| [클라우드 인프라 초기 셋업](./onboarding/infra-setup.md) | Vercel, 오브젝트 스토리지 최초 1회 설정 |
| [로컬 환경 세팅](./onboarding/local-setup.md) | Node.js, PostgreSQL, 프론트엔드 + 실시간 서버 + API 서버 초기 설정 |
| [API 키 설정](./onboarding/api-keys.md) | Mapbox, PG사, OAuth 키 발급 방법 |
| [환경변수 레퍼런스](./onboarding/env-vars.md) | 전체 환경변수 목록 및 설명 |
| [개발 명령어](./onboarding/commands.md) | npm / psql / Docker 명령어 레퍼런스 |

### 프론트엔드 개발

| 문서 | 설명 |
|---|---|
| [프론트엔드 컨벤션](./frontend/conventions.md) | 선택 페이지·플레이 씬·내 주변·에셋 미리보기, 이동·카메라, 씬 HUD, 만남 대화, 펼침 지도(Mapbox GL JS), App Router 라우트 설계 |

### 백엔드 개발

| 문서 | 설명 |
|---|---|
| [개발 컨벤션](./backend/conventions.md) | API 설계 원칙, NestJS 모듈 구조, 공간 쿼리 규칙, socket.io 게이트웨이 |
| [보안 규격](./backend/security/encryption.md) | JWT 구조, 토큰 이중 구조, RLS, 가시거리 라이선스 |

### 테스트

| 문서 | 설명 |
|---|---|
| [테스트 전략](./testing/strategy.md) | Phase별 완료 기준, 단위·통합·부하 테스트 시나리오 |

### 운영 가이드

| 문서 | 설명 |
|---|---|
| [배포 절차](./operations/runbook/deploy.md) | 로컬 → Vercel / API 서버·실시간 서버 프로덕션 배포 단계 |
| [모니터링](./operations/monitoring.md) | Mapbox·서버 비용 알림 및 대시보드 |
| [과금 방어 대응](./operations/runbook/billing-guard.md) | API 과금 폭탄 원인 및 즉시 차단 절차 |

---

## 핵심 명령어

```bash
# 프론트엔드 (루트)
npm run dev          # next dev --turbopack
npm run build
npm run type-check

# 실시간 서버 (apps/realtime, socket.io 9002)
cd apps/realtime
npm run start:dev    # watch 모드
npm run build
npm run start:prod
npm run type-check

# API 서버 (apps/api, REST 9001)
cd apps/api
npm run start:dev    # watch 모드
npm run build
npm run start:prod
npm run type-check

# DB 마이그레이션 (관리 롤로, apps/api/migrations/ SQL 번호 순서대로)
for f in apps/api/migrations/*.sql; do psql -v ON_ERROR_STOP=1 "$DATABASE_URL_ADMIN" -f "$f"; done

# Docker Compose — 프론트 프로덕션 빌드(app) + 실시간 서버(realtime)
docker compose --env-file .env.local up -d --build
```

---

## 현재 Phase 상태

| Phase | 목표 | 상태 |
|---|---|---|
| Phase 1 | UI/UX 기반 구축 — 남은 작업: 로그인 화면·인증 BFF 라우트, 게임 셸 | 진행 중 |
| Phase 2 | 3D 캐릭터 이동 + 실시간 동기화 — 남은 작업: 맵 화면, 내 주변 2·3단계, 자체 에셋 교체, 내 주변 만남 대화 | 진행 중 |
| Phase 3 | 인앱 결제 + 아바타 발급 + 가시거리 라이선스 — 남은 작업: 상점 화면, PG 결제창 연동, 자동 취소, 발급 대기 연출 | 진행 중 |
| Phase 4 | B2B 스폰서십 광고(브랜드 텍스처 에셋 + 펼침 지도 좌표 마커) + 가시거리 렌더링 연동 + 광고주 포탈 + 채팅 UI | 예정 |
| Phase 5 | 상용화 (프로덕션 부하 테스트, 동접 200명, 만남 대화 공개 준비) | 예정 |

---

## 인프라 비용 목표

자체 호스팅 기준. DB/API 서버·실시간 서버 호스팅 + Mapbox(무료 티어 내) + Vercel(소규모 무료~소액)로 구성한다. 상세 항목은 [아키텍처 개요 — 비용 목표](./architecture/overview.md#비용-목표)를 확인하라.
