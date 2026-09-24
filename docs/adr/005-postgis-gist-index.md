# ADR 005: PostGIS + GiST 인덱스 공간 연산

**상태:** Accepted

## 결정

실좌표(위경도) 기반 공간 쿼리인 스폰서 랜드마크(`sponsor_buildings`) 반경 조회·거리 정렬에 **PostGIS + GiST(Generalized Search Tree) 공간 인덱스**를 사용한다. 별도의 Elasticsearch 지오쿼리나 Redis Geospatial을 도입하지 않는다.

유저 위치는 DB에 저장하지 않으므로 PostGIS 대상이 아니다. 대시보드 월드의 섹터 판정과 서버 속도 검증은 게이트웨이 메모리에서 `shared/world/sector.ts`(haversine 거리)로 계산하고, 클라이언트의 거리·속도 사전 검증은 cheap-ruler(위도 37.5° 고정)로 따로 계산한다.

## 배경

스폰서 랜드마크는 Mapbox 실지형 건물 ID(`mapbox_feature_id`)와 위경도 포인트(`geom`)로 등록된다. 광고 노출 감지(Phase 5)에는 "특정 좌표 반경 R미터 이내에 있는 활성 스폰서 랜드마크를 가까운 순으로 찾아라"는 공간 연산이 필요하다. 이 연산의 특성은 다음과 같다.

- 반경 기반 포인트 쿼리 (`ST_DWithin`)
- 거리 정렬 (`ORDER BY ST_Distance`)
- 위경도(EPSG:4326) 좌표계에서의 구면 거리 계산

## 근거

| 항목 | Redis Geospatial | PostGIS + GiST |
|---|---|---|
| 공간 인덱스 성능 | GEORADIUS O(N+log M) | GiST R-Tree, 0.001초 이하 |
| 추가 인프라 | Redis 서버 별도 필요 | 자체 PostgreSQL 내장 |
| 트랜잭션 일관성 | DB와 별도, 동기화 필요 | DB와 동일 트랜잭션 |
| 쿼리 복잡도 | 단순 반경만 가능 | 폴리곤 교차 등 복합 쿼리 가능 |
| 비용 | Redis Cloud 추가 과금 | 자체 PostgreSQL에 포함 |

## 필수 인덱스와 조회 함수

```sql
-- sponsor_buildings 공간 인덱스 (0003_sponsor.sql)
CREATE INDEX idx_sponsor_buildings_geom ON sponsor_buildings USING gist(geom);

-- 반경 내 활성 스폰서 랜드마크를 가까운 순으로 조회 (0005_spatial_query_fn.sql)
CREATE OR REPLACE FUNCTION nearby_sponsor_buildings(
  p_lng float8, p_lat float8, p_radius_m float8 DEFAULT 500
) RETURNS TABLE (id bigint, advertiser_id uuid, mapbox_feature_id text,
                 texture_url text, lng float8, lat float8, distance_m float8)
...
  FROM sponsor_buildings sb
  WHERE sb.is_active = true
    AND ST_DWithin(sb.geom::geography,
                   ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
                   p_radius_m)
  ORDER BY distance_m;
```

## 적용 범위

| 연산 | 함수 | 용도 |
|---|---|---|
| 반경 내 활성 스폰서 랜드마크 탐지 | `ST_DWithin` | 광고 노출 감지 |
| 거리 기준 정렬 | `ST_Distance` | 근접순 정렬 |

두 연산은 `nearby_sponsor_buildings` 함수로 제공된다. 앱(프론트엔드·NestJS)에는 이 함수를 호출하는 코드가 없고, 저장소의 Supabase Edge Function `supabase/functions/spatial-query`만 RPC로 호출한다. 광고 노출 감지는 Phase 5에서 구현한다.

## 주의

- `geom` 컬럼은 반드시 `GEOMETRY(Point, 4326)` 타입으로 정의
- 거리 계산 시 `::geography` 캐스팅 필수 (미터 단위, 구면 보정)
- `GEOMETRY`로 비교하면 평면 좌표계 기준으로 미터 환산 오차 발생
- 현재 함수는 `geom::geography` 식으로 조회하므로 `geom`(geometry)에 걸린 GiST 인덱스와 식이 달라 인덱스를 타지 않는다. 광고 노출 감지를 붙이는 Phase 5에서 `((geom::geography))` 표현식 GiST 인덱스를 추가한다

## 관련

- [데이터 모델 — sponsor_buildings](../architecture/data-model.md)
- [파이프라인 흐름 — 광고 노출 (Phase 5 예정)](../architecture/pipeline-flow.md)
