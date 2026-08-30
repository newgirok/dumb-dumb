# 개발 명령어

---

## Next.js

```bash
# 개발 서버 (핫 리로드)
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 로컬 실행
npm run start

# TypeScript 타입 체크
npm run type-check

# ESLint 검사
npm run lint
```

---

## Supabase CLI

```bash
# 로컬 스택 전체 기동 (PostgreSQL + PostGIS + Auth + Realtime + Storage + Edge Functions)
supabase start

# 로컬 스택 종료
supabase stop

# DB 마이그레이션 생성
supabase migration new <migration-name>

# 로컬 DB에 마이그레이션 적용
supabase db push

# 프로덕션 DB에 마이그레이션 적용 (주의: 프로덕션 영향)
supabase db push --linked

# 현재 로컬 DB 스키마를 마이그레이션 파일로 덤프
supabase db diff --use-migra

# Edge Functions 로컬 실행 (핫 리로드)
supabase functions serve

# 특정 Edge Function만 실행
supabase functions serve payment-webhook

# Edge Function 프로덕션 배포
supabase functions deploy payment-webhook

# 전체 Edge Functions 배포
supabase functions deploy

# Supabase Studio (DB GUI)
# http://localhost:54323 (supabase start 실행 중)

# 로컬 DB SQL 직접 실행
supabase db run --file ./supabase/migrations/0001_init.sql
```

---

## Docker Compose

```bash
# 개발 서버 기동 (패키지 변경 후 볼륨 초기화 포함)
docker compose down -v && docker compose up --build -d

# 개발 서버 기동 (코드만 변경한 경우)
docker compose up -d

# 로그 실시간 확인
docker compose logs -f

# 개발 서버 종료
docker compose down

# Docker Desktop 실행 여부 확인
docker info
```

---

## 디버깅

```bash
# Supabase 로컬 로그 (Realtime, Auth, Edge Functions 로그)
supabase logs

# Edge Function 로그만
supabase logs --project-ref local functions
```

---

## 관련 문서

- [로컬 환경 세팅](./local-setup.md)
- [배포 절차](../operations/runbook/deploy.md)
