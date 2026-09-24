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

# ESLint 검사 (next lint)
npm run lint
```

저장소에 ESLint 설정 파일이 없어 `npm run lint`는 설정 방식(Strict/Base)을 묻는 대화형 프롬프트를 띄운다. 비대화형 환경(CI 등)의 정적 검사는 `npm run type-check`를 쓴다.

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

# 프로덕션 실행 (dist/apps/api/src/main — shared/를 함께 컴파일해 경로가 깊다)
npm run start:prod

# TypeScript 타입 체크
npm run type-check
```

---

## DB 마이그레이션

`supabase/migrations/`의 SQL을 **번호 순서대로**(`0001`~`0010`) PostgreSQL에 적용한다. 전용 CLI 러너는 없으며 psql로 직접 적용한다. 일반 PostgreSQL이면 먼저 `auth.users` 스텁을 만들고, 적용 뒤 `app_api` 로그인을 켠다([로컬 환경 세팅](./local-setup.md) 3-2·3-3).

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

`docker-compose.yml`에는 프론트엔드만 정의되어 있다. 개발용 `app`(`next dev`)과 프로덕션 빌드용 `app-prod`(`profile: prod`, standalone)가 있고 둘 다 호스트 3000 포트를 쓴다.

```bash
# 개발 컨테이너 기동
docker compose up -d

# 로그 실시간 확인
docker compose logs -f

# 종료
docker compose down

# 프로덕션 이미지 빌드 + 기동 — NEXT_PUBLIC_* 빌드 인자를 .env.local에서 채운다
docker compose --env-file .env.local --profile prod up -d --build app-prod

# Docker Desktop 실행 여부 확인
docker info
```

`app-prod`는 `NEXT_PUBLIC_MAPBOX_TOKEN`·`NEXT_PUBLIC_LIVEKIT_URL`·`NEXT_PUBLIC_APP_URL`을 빌드 시점에 굽는다. `--env-file .env.local` 없이 빌드하면 빈 값으로 구워진다. 코드 변경은 `--build`로 이미지를 다시 만들어야 반영된다.

---

## 관련 문서

- [로컬 환경 세팅](./local-setup.md)
- [배포 절차](../operations/runbook/deploy.md)
