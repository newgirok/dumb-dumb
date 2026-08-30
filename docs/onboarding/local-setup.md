# 로컬 환경 세팅

---

## 사전 요구사항

| 도구 | 버전 | 설치 방법 |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| Docker Desktop | 최신 | https://docker.com |
| Git | 최신 | https://git-scm.com |

---

## 1. 저장소 클론 및 의존성 설치

```bash
git clone https://github.com/newgirok/openworld.git
cd openworld
npm install
```

---

## 2. 환경변수 설정

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열고 Supabase Cloud 프로젝트의 값을 채운다. 최초 1회 클라우드 인프라 설정은 [클라우드 인프라 초기 셋업](./infra-setup.md)을 참고하라.

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

전체 항목 설명은 [환경변수 레퍼런스](./env-vars.md)를 참고하라.

---

## 3. Docker Compose로 개발 서버 기동

```bash
# 처음 실행하거나 npm 패키지를 추가/변경한 경우
docker compose down -v && docker compose up --build -d

# 코드만 변경한 경우 (빠른 재시작)
docker compose up -d
```

`WATCHPACK_POLLING=true`가 `docker-compose.yml`에 설정되어 있어 Windows에서도 핫 리로드가 정상 작동한다. 내부적으로 `next dev --turbopack`으로 실행된다.

---

## 4. 접속 확인

브라우저에서 http://localhost:3000 접속.

첫 번째 페이지 요청 시 Turbopack이 해당 라우트를 컴파일한다 (최초 ~5~9초, 이후 캐시됨).

---

## 5. 로그 확인

```bash
docker compose logs -f
```

---

## 6. DB 마이그레이션 (클라우드 반영)

Supabase Cloud에 마이그레이션을 적용할 때는 CLI를 사용한다.

```bash
# 프로젝트 연결 (최초 1회)
supabase link --project-ref <project-ref>

# 마이그레이션 적용
supabase db push --linked
```

---

## 개발 스택 종료

```bash
docker compose down
```

---

## 관련 문서

- [환경변수 레퍼런스](./env-vars.md)
- [클라우드 인프라 초기 셋업](./infra-setup.md)
- [개발 명령어](./commands.md)
