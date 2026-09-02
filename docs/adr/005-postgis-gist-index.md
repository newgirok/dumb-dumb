# ADR 005: PostGIS + GiST 인덱스 공간 연산

**상태:** Accepted

## 결정

위치 기반 근접 탐지 및 스폰서 랜드마크 감지에 **PostGIS + GiST(Generalized Search Tree) 공간 인덱스**를 사용한다. 별도의 Elasticsearch 지오쿼리나 Redis Geospatial을 도입하지 않는다.

## 배경

캐릭터가 이동할 때마다 "내 현재 좌표 반경 R미터 이내에 있는 스폰서 랜드마크·다른 유저를 실시간으로 찾아라"는 공간 연산이 발생한다. 이 연산의 특성은 다음과 같다.

- 반경 기반 포인트 쿼리 (`ST_DWithin`)
- 거리 정렬 (`ORDER BY ST_Distance`)
- 연산 빈도: 유저가 50m 이동할 때마다

## 근거

| 항목 | Redis Geospatial | PostGIS + GiST |
|---|---|---|
| 공간 인덱스 성능 | GEORADIUS O(N+log M) | GiST R-Tree, 0.001초 이하 |
| 추가 인프라 | Redis 서버 별도 필요 | Supabase DB 내장 |
| 트랜잭션 일관성 | DB와 별도, 동기화 필요 | DB와 동일 트랜잭션 |
| 쿼리 복잡도 | 단순 반경만 가능 | 폴리곤 교차, 오솔길 스냅 등 복합 가능 |
| 비용 | Redis Cloud 추가 과금 | Supabase Pro에 포함 |

## 필수 인덱스

```sql
-- sponsor_buildings 공간 인덱스
CREATE INDEX ON sponsor_buildings USING gist(geom);

-- 현재 캐릭터 위치 반경 R 이내 스폰서 랜드마크 조회
SELECT id, texture_url, ST_Distance(geom, ST_MakePoint($lon, $lat)::geography) AS dist
FROM sponsor_buildings
WHERE ST_DWithin(geom::geography, ST_MakePoint($lon, $lat)::geography, $radius)
  AND is_active = true
ORDER BY dist;
```

## 적용 범위

| 연산 | 함수 | 용도 |
|---|---|---|
| 반경 내 스폰서 랜드마크 탐지 | `ST_DWithin` | 광고 노출 감지 |
| 거리 기준 정렬 | `ST_Distance` | LiveKit 구독 Top-8 선정 |
| 오솔길 스냅 | `ST_ClosestPoint` | GPS 오차 캐릭터 정렬 |
| 지형지물 충돌 판정 | `ST_Within` | 나무·바위 등 지형지물 진입 차단 |

## 주의

- `geom` 컬럼은 반드시 `GEOMETRY(Point, 4326)` 타입으로 정의
- 거리 계산 시 `::geography` 캐스팅 필수 (미터 단위, 구면 보정)
- `GEOMETRY`로 비교하면 평면 좌표계 기준으로 미터 환산 오차 발생

## 관련

- [데이터 모델 — sponsor_buildings](../architecture/data-model.md)
- [파이프라인 흐름 — 이동 + 공간 연산](../architecture/pipeline-flow.md)
