# 데이터 모델

PostgreSQL + PostGIS 기반 단일 공유 스키마. 공간 연산 상세는 [ADR 005](../adr/005-postgis-gist-index.md)를 참고하세요.

마이그레이션 SQL은 `supabase/migrations/`의 `0001`~`0010` 파일로 관리하며, PostGIS·pg_cron·pgcrypto·citext
확장을 사용한다. 모든 외래 키는 애플리케이션 테이블 `users`를 참조한다.

---

## ER 다이어그램 (텍스트)

```
users
  │ 1
  │ ├─────── n ──▶ user_identities   (소셜 로그인 수단: kakao / google)
  │ ├─────── n ──▶ characters        (보유 아바타)
  │ ├─────── n ──▶ orders            (결제 주문)
  │ └─────── 1 ──▶ user_licenses     (가시거리 등급)
  │
  │ (role = 'advertiser')
  └─────── n ──▶ sponsor_buildings   (광고 랜드마크)
                     │ 1
                     └─────── n ──▶ ad_impressions  (노출 로그)

characters.order_id ──▶ orders.id    (묶음 상품 멱등 발급)
```

---

## 테이블 상세

### `users`

서비스의 모든 계정. 이메일+비밀번호 또는 소셜 로그인으로 가입한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | 계정 ID |
| `email` | CITEXT | UNIQUE | 대소문자 무시 이메일 |
| `password_hash` | TEXT | NULL 허용 | bcrypt 해시 (소셜 전용 계정은 없음, 항상 비밀번호 보유) |
| `nickname` | VARCHAR(32) | NOT NULL | 표시 이름 |
| `role` | user_role | NOT NULL | `'user'` / `'advertiser'` / `'admin'` |
| `token_version` | INTEGER | NOT NULL | 토큰 일괄 폐기용 카운터 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | 가입 시각 |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | 최종 수정 시각 |

기본 라이선스(`user_licenses`) 레코드는 회원가입 트랜잭션에서 애플리케이션이 함께 생성한다.
`role` 컬럼은 컬럼 단위 권한으로 수정을 차단해 권한 상승을 방지하며, 역할 변경은 운영 경로로만 수행한다.

```sql
CREATE TYPE user_role AS ENUM ('user', 'advertiser', 'admin');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT,
  nickname      VARCHAR(32) NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### `user_identities`

계정과 소셜 로그인 수단을 1:N으로 분리한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → users ON DELETE CASCADE | 연결 계정 |
| `provider` | auth_provider | | `'kakao'` / `'google'` |
| `provider_user_id` | TEXT | | 공급자 측 유저 ID |
| `email` | CITEXT | | 공급자 이메일 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | 연결 시각 |

```sql
CREATE TYPE auth_provider AS ENUM ('kakao', 'google');

CREATE TABLE user_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         auth_provider NOT NULL,
  provider_user_id TEXT NOT NULL,
  email            CITEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);
```

### `characters`

유저가 보유한 유니크 3D 아바타.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BIGSERIAL | PK | 시스템 내부 ID |
| `serial_number` | VARCHAR(32) | UNIQUE | 유저 노출용 (`Dog #3,491`), 시퀀스 `character_serial_seq` |
| `owner_id` | UUID | FK → users ON DELETE RESTRICT | 소유 유저 |
| `appearance_hash` | CHAR(64) | UNIQUE | 외형 조합 SHA-256 (겹침 방지) |
| `appearance_data` | JSONB | NOT NULL | 외형 파라미터 원본 (`{body_color, pattern_id, ear_angle, ...}`) |
| `glb_url` | TEXT | | 렌더링용 GLB 에셋 주소 |
| `is_equipped` | BOOLEAN | DEFAULT false | 현재 장착 여부 |
| `order_id` | UUID | FK → orders ON DELETE RESTRICT | 발급 근거 주문 |
| `order_seq` | INTEGER | | 묶음 주문 내 순번 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | 발급 시각 |

`UNIQUE(order_id, order_seq)`로 묶음 상품(`bundle_10`)의 멱등 발급을 보장한다. 같은 주문·순번은
두 번 발급될 수 없다.

```sql
CREATE SEQUENCE character_serial_seq;

CREATE TABLE characters (
  id              BIGSERIAL PRIMARY KEY,
  serial_number   VARCHAR(32) UNIQUE NOT NULL,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  appearance_hash CHAR(64) UNIQUE NOT NULL,
  appearance_data JSONB NOT NULL,
  glb_url         TEXT,
  is_equipped     BOOLEAN DEFAULT false,
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_seq       INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (order_id, order_seq)
);
```

### `orders`

결제 주문. 결제 완료 여부와 무관하게 모든 주문 시도를 기록한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | 멱등성 키 (PG사로 전달) |
| `user_id` | UUID | FK → users ON DELETE RESTRICT | 주문자 |
| `product_type` | order_product | | `'character'` / `'license_100m'` / `'license_300m'` / `'bundle_10'` |
| `amount_krw` | INTEGER | NOT NULL | 결제 금액 (원화) |
| `status` | order_status | | `'PENDING'` / `'PAID'` / `'FAILED'` / `'REFUNDED'` |
| `pg_approval_number` | TEXT | NOT NULL일 때 UNIQUE | PG사 승인 번호 (중복 웹훅 방어) |
| `fail_reason` | TEXT | | 실패 원인 (CS 대응용) |
| `fulfill_attempts` | INTEGER | DEFAULT 0 | 발급 워커 시도 횟수 |
| `fulfilled_at` | TIMESTAMPTZ | | 발급 완료 시각 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | 주문 생성 시각 |
| `completed_at` | TIMESTAMPTZ | | 결제 완료 시각 |

`pg_approval_number`에 걸린 부분 유니크 제약(`orders_pg_approval_uniq`)이 동일 승인번호의 중복
처리를 DB 레벨에서 차단한다.

```sql
CREATE TYPE order_product AS ENUM ('character', 'license_100m', 'license_300m', 'bundle_10');
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  product_type       order_product NOT NULL,
  amount_krw         INTEGER NOT NULL,
  status             order_status NOT NULL DEFAULT 'PENDING',
  pg_approval_number TEXT,
  fail_reason        TEXT,
  fulfill_attempts   INTEGER NOT NULL DEFAULT 0,
  fulfilled_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

-- 승인번호 멱등성 제약 (NOT NULL일 때만 유니크)
CREATE UNIQUE INDEX orders_pg_approval_uniq
  ON orders (pg_approval_number)
  WHERE pg_approval_number IS NOT NULL;
```

### `user_licenses`

유저별 가시거리 라이선스 등급(3D 씬의 뷰 디스턴스 반경). 1유저 1레코드.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `user_id` | UUID PK | users FK (ON DELETE CASCADE) |
| `visibility_radius_m` | INTEGER | 현재 가시거리 반경(미터). 기본 25 |
| `updated_at` | TIMESTAMPTZ | 최종 업그레이드 시각 |

```sql
CREATE TABLE user_licenses (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  visibility_radius_m INTEGER NOT NULL DEFAULT 25,
  updated_at          TIMESTAMPTZ DEFAULT now()
);
```

### `sponsor_buildings`

B2B 광고 랜드마크 마스터 테이블. 씬에 배치되는 브랜드 텍스처 에셋과 5시 GIS 미니맵 마커를 함께
받치며, `geom` 컬럼에 GiST 인덱스 필수.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `advertiser_id` | UUID FK → users ON DELETE RESTRICT | 광고주 계정 (`role='advertiser'`) |
| `mapbox_feature_id` | TEXT | 5시 GIS 미니맵의 실지형 Feature ID (미니맵 마커 연동) |
| `geom` | GEOMETRY(Point, 4326) | 랜드마크 중심 좌표 — GIS 미니맵/좌표 레이어를 받치는 PostGIS (GiST 인덱스 적용) |
| `texture_url` | TEXT | 브랜드 로고 URL |
| `default_texture_url` | TEXT | 광고 미집행 시 기본 텍스처 |
| `is_active` | BOOLEAN | 광고 활성 여부 |
| `starts_at` | TIMESTAMPTZ | 광고 시작일 |
| `ends_at` | TIMESTAMPTZ | 광고 종료일 |

```sql
CREATE TABLE sponsor_buildings (
  id                  BIGSERIAL PRIMARY KEY,
  advertiser_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  mapbox_feature_id   TEXT,
  geom                GEOMETRY(Point, 4326) NOT NULL,
  texture_url         TEXT NOT NULL,
  default_texture_url TEXT,
  is_active           BOOLEAN DEFAULT false,
  starts_at           TIMESTAMPTZ,
  ends_at             TIMESTAMPTZ
);

-- GiST 인덱스 (필수)
CREATE INDEX idx_sponsor_buildings_geom ON sponsor_buildings USING gist(geom);

-- pg_cron 자동 활성/비활성 스케줄러 (매일 15:00 UTC = 00:00 KST)
SELECT cron.schedule('activate-ads', '0 15 * * *', $$
  UPDATE sponsor_buildings SET is_active = true  WHERE starts_at::date = CURRENT_DATE;
  UPDATE sponsor_buildings SET is_active = false WHERE ends_at::date   = CURRENT_DATE - 1;
$$);
```

### `ad_impressions`

유효 노출 로그. 1초 이상 뷰포트 내 완전 진입한 경우만 기록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `building_id` | BIGINT FK → sponsor_buildings | |
| `user_id` | UUID FK → users ON DELETE CASCADE | 노출된 유저 |
| `impressed_at` | TIMESTAMPTZ | 노출 시각 |

---

## 보안 계층 (RLS)

API 서버(가드 + 리포지토리)가 1차 방어, PostgreSQL RLS가 2차 방어를 담당한다.

- 요청마다 트랜잭션 안에서 `set_config('app.user_id', …, true)` / `set_config('app.user_role', …, true)`로
  현재 유저 컨텍스트를 주입하고, 정책이 이 값을 읽는다. 반드시 트랜잭션 범위여야 하며 전역 `SET`는
  금지한다(커넥션 풀에 컨텍스트가 남아 유출될 수 있음).
- API는 테이블 소유자가 아닌 전용 롤 `app_api`로 접속해야 RLS가 적용된다.
- 핵심은 광고주 간 테넌시 격리(`sponsor_buildings`, `ad_impressions`)다. 활성 광고(`is_active=true`)는
  렌더링을 위해 누구나 SELECT 가능하다.
- 서버 전용 작업(결제 웹훅·발급 워커)은 admin 컨텍스트(`withAdmin`)로 RLS를 우회한다.

---

## 주요 쿼리

### 반경 내 스폰서 랜드마크 탐지 (Phase 5 예정 기능)

```sql
-- 미니맵 상 유저 위치 반경 R미터 이내의 활성 스폰서 랜드마크
SELECT id, texture_url,
       ST_Distance(geom::geography, ST_MakePoint($lon, $lat)::geography) AS dist_m
FROM sponsor_buildings
WHERE is_active = true
  AND ST_DWithin(geom::geography, ST_MakePoint($lon, $lat)::geography, $radius_m)
ORDER BY dist_m;
```

---

## 관련 문서

- [ADR 005 — PostGIS GiST 인덱스](../adr/005-postgis-gist-index.md)
- [파이프라인 흐름](./pipeline-flow.md)
- [비즈니스 규칙](../product/business-rules.md)
