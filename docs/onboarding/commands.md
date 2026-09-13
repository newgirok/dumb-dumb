# 개발 명령어

---

## 프론트엔드 (Next.js, 루트)

```bash
# 개발 서버 (핫 리로드, Turbopack, 3000 포트)
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

## API 서버 (NestJS, `apps/api`)

`apps/api` 디렉토리에서 실행한다.

```bash
# 개발 서버 (watch 모드, 9001 포트)
npm run start:dev

# 서버 실행 (watch 없음)
npm run start

# 빌드
npm run build

# 프로덕션 실행 (dist/main)
npm run start:prod

# TypeScript 타입 체크
npm run type-check
```

---

## DB 마이그레이션

`supabase/migrations/`의 SQL을 **번호 순서대로**(`0001`~`0010`) PostgreSQL에 적용한다. 전용 CLI 러너는 없으며 psql로 직접 적용한다.

```bash
# 전체 순서 적용
for f in supabase/migrations/*.sql; do
  psql -U postgres -d postgres -f "$f"
done

# 개별 적용
psql -U postgres -d postgres -f supabase/migrations/0001_init.sql
```

확장(PostGIS / pg_cron / pgcrypto / citext)이 먼저 활성화되어 있어야 한다. 자세한 준비 절차는 [로컬 환경 세팅](./local-setup.md) 참고.

---

## Docker Compose (프론트)

`docker-compose.yml`에는 프론트엔드(`app` 서비스)만 정의되어 있다.

```bash
# 프론트 컨테이너 기동
docker compose up -d

# 로그 실시간 확인
docker compose logs -f

# 종료
docker compose down

# Docker Desktop 실행 여부 확인
docker info
```

---

## 관련 문서

- [로컬 환경 세팅](./local-setup.md)
- [배포 절차](../operations/runbook/deploy.md)
