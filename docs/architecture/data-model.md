# 데이터 모델

Supabase Pro(PostgreSQL + PostGIS) 기반 스키마. 공간 연산 상세는 [ADR 005](../adr/005-postgis-gist-index.md)를 참고하세요.

---

## ER 다이어그램 (텍스트)

```
users (Supabase Auth)
  │ 1
  │ ├─────── n ──▶ characters         (보유 아바타)
  │ ├─────── n ──▶ orders             (결제 주문)
  │ └─────── 1 ──▶ user_licenses      (가시거리 등급)
  │
advertisers
  │ 1
  └─────── n ──▶ sponsor_buildings   (광고 랜드마크)
                     │ 1
                     └─────── n ──▶ ad_impressions  (노출 로그)
```

---

## 테이블 상세

### `characters`

유저가 구매한 유니크 3D 아바타.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BIGSERIAL | PK | 시스템 내부 ID |
| `serial_number` | VARCHAR(32) | UNIQUE | 유저 노출용 (`Dog #3,491`) |
| `owner_id` | UUID | FK → auth.users | 소유 유저 |
| `appearance_hash` | CHAR(64) | UNIQUE | 외형 조합 SHA-256 (겹침 방지) |
| `appearance_data` | JSONB | NOT NULL | 외형 파라미터 원본 (`{body_color, pattern_id, ear_angle, ...}`) |
| `glb_url` | TEXT | | Supabase Storage GLB 에셋 주소 |
| `is_equipped` | BOOLEAN | DEFAULT false | 현재 장착 여부 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | 결제 완료 시각 |

```sql
CREATE TABLE characters (
  id            BIGSERIAL PRIMARY KEY,
  serial_number VARCHAR(32) UNIQUE NOT NULL,
  owner_id      UUID NOT NULL REFERENCES auth.users(id),
  appearance_hash CHAR(64) UNIQUE NOT NULL,
  appearance_data JSONB NOT NULL,
  glb_url       TEXT,
  is_equipped   BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### `orders`

결제 주문 이력. 결제 완료 여부와 무관하게 모든 주문 시도를 기록한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | 멱등성 키 (PG사로 전달) |
| `user_id` | UUID | FK → auth.users | 주문자 |
| `product_type` | ENUM | | `'character'` / `'license_100m'` / `'license_300m'` / `'bundle_10'` |
| `amount_krw` | INTEGER | NOT NULL | 결제 금액 (원화) |
| `status` | ENUM | | `'PENDING'` / `'PAID'` / `'FAILED'` / `'REFUNDED'` |
| `pg_approval_number` | TEXT | | PG사 승인 번호 |
| `fail_reason` | TEXT | | 실패 원인 (CS 대응용) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | 주문 생성 시각 |
| `completed_at` | TIMESTAMPTZ | | 결제 완료 시각 |

```sql
CREATE TYPE order_product AS ENUM ('character', 'license_100m', 'license_300m', 'bundle_10');
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id),
  product_type       order_product NOT NULL,
  amount_krw         INTEGER NOT NULL,
  status             order_status NOT NULL DEFAULT 'PENDING',
  pg_approval_number TEXT,
  fail_reason        TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  completed_at       TIMESTAMPTZ
);
```

### `user_licenses`

유저별 가시거리 라이선스 등급. 1유저 1레코드.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `user_id` | UUID PK | auth.users FK |
| `visibility_radius_m` | INTEGER | 현재 가시거리 반경(미터). 기본 25 |
| `updated_at` | TIMESTAMPTZ | 최종 업그레이드 시각 |

```sql
CREATE TABLE user_licenses (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id),
  visibility_radius_m  INTEGER NOT NULL DEFAULT 25,
  updated_at           TIMESTAMPTZ DEFAULT now()
);
```

### `sponsor_buildings`

B2B 광고 랜드마크 마스터 테이블. `geom` 컬럼에 GiST 인덱스 필수.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `advertiser_id` | UUID | 광고주 계정 |
| `mapbox_feature_id` | TEXT | Mapbox 지형지물 폴리곤 Feature ID (숲 속 랜드마크로 표시) |
| `geom` | GEOMETRY(Point, 4326) | 랜드마크 중심 좌표 (GiST 인덱스 적용) |
| `texture_url` | TEXT | 브랜드 로고 URL (Supabase Storage) |
| `default_texture_url` | TEXT | 광고 미집행 시 기본 텍스처 |
| `is_active` | BOOLEAN | 광고 활성 여부 |
| `starts_at` | TIMESTAMPTZ | 광고 시작일 |
| `ends_at` | TIMESTAMPTZ | 광고 종료일 |

```sql
CREATE TABLE sponsor_buildings (
  id                 BIGSERIAL PRIMARY KEY,
  advertiser_id      UUID NOT NULL,
  mapbox_feature_id  TEXT,
  geom               GEOMETRY(Point, 4326) NOT NULL,
  texture_url        TEXT NOT NULL,
  default_texture_url TEXT,
  is_active          BOOLEAN DEFAULT false,
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ
);

-- GiST 인덱스 (필수)
CREATE INDEX idx_sponsor_buildings_geom ON sponsor_buildings USING gist(geom);

-- pg_cron 자동 활성/비활성 스케줄러 (매일 00:00 KST)
-- SELECT cron.schedule('activate-ads', '0 15 * * *', $$
--   UPDATE sponsor_buildings SET is_active = true  WHERE starts_at::date = CURRENT_DATE;
--   UPDATE sponsor_buildings SET is_active = false WHERE ends_at::date   = CURRENT_DATE - 1;
-- $$);
```

### `ad_impressions`

유효 노출 로그. 1초 이상 뷰포트 내 완전 진입한 경우만 기록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `building_id` | BIGINT FK | sponsor_buildings |
| `user_id` | UUID | 노출된 유저 |
| `impressed_at` | TIMESTAMPTZ | 노출 시각 |

---

## 주요 쿼리

### 반경 내 스폰서 랜드마크 탐지

```sql
-- 현재 유저 위치 반경 R미터 이내의 활성 스폰서 랜드마크
SELECT id, texture_url,
       ST_Distance(geom::geography, ST_MakePoint($lon, $lat)::geography) AS dist_m
FROM sponsor_buildings
WHERE is_active = true
  AND ST_DWithin(geom::geography, ST_MakePoint($lon, $lat)::geography, $radius_m)
ORDER BY dist_m;
```

### 음성 Top-8 거리 정렬

```sql
-- 현재 유저 반경 30m 이내 접속 세션을 거리 오름차순으로 정렬 → 상위 8명만 구독
SELECT session_id, user_id,
       ST_Distance(geom::geography, ST_MakePoint($lon, $lat)::geography) AS dist_m
FROM active_sessions
WHERE ST_DWithin(geom::geography, ST_MakePoint($lon, $lat)::geography, 30)
  AND user_id != $my_user_id
ORDER BY dist_m
LIMIT 8;
```

---

## 관련 문서

- [ADR 005 — PostGIS GiST 인덱스](../adr/005-postgis-gist-index.md)
- [파이프라인 흐름](./pipeline-flow.md)
- [비즈니스 규칙](../product/business-rules.md)
