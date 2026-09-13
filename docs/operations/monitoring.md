# 모니터링

---

## 비용 알림 설정

### Mapbox

Mapbox 대시보드 → "Billing" → "Budget alerts"에서 3단계 알림을 설정합니다.

Mapbox는 5시 GIS 미니맵 전용이므로, 타일 요청량은 미니맵을 띄운 세션 수와 GPS 위치 갱신 빈도에 좌우된다.

| 단계 | 임계치 | 조치 |
|---|---|---|
| 경고 | 무료 티어의 50% | 트래픽 패턴 확인 |
| 주의 | 무료 티어의 80% | 미니맵 GPS 갱신 주기·타일 캐시 정책 점검 |
| 차단 | 무료 티어의 100% | Rate Limit + Billing Hard Cap 즉시 적용 |

무료 티어 초과 원인 주요 용의자:
- 미니맵 GPS 위치 갱신 주기가 과도하게 짧아 타일 요청 폭증
- Mapbox 토큰 도용 (도메인 락 미설정)
- 미니맵 줌 레벨 미고정으로 넓은 지역 타일 대량 요청

### 자체 PostgreSQL + API 서버

호스팅은 정액 요금제에 묶이지 않으므로, 벤더 청구서 대신 **자원 사용량 지표**를 직접
관측해 임계치에서 대응한다. DB와 API 서버는 하나의 공유 인스턴스를 바라보므로 두 계층을
함께 본다.

| 지표 | 확인 방법 | 임계치 | 조치 |
|---|---|---|---|
| DB 스토리지 | `pg_database_size()` | 프로비저닝 용량의 80% | 오래된 `ad_impressions` 파티셔닝·아카이빙 검토 |
| 커넥션 풀 사용률 | `pg_stat_activity` vs `DB_POOL_MAX` | 활성 커넥션이 풀 상한의 80% | `DB_POOL_MAX` 상향 또는 API 서버 수평 확장, 누수 쿼리 추적 |
| socket.io 동시 연결 | 월드 게이트웨이 접속 소켓 수 | 인스턴스당 500 concurrent | 섹터 이탈 채널 해제 로직 점검, API 서버 스케일아웃 |
| 활성 섹터 채널 수 | 게이트웨이가 방송 중인 섹터(room) 수 | 급증 패턴 | 유령 채널(빈 섹터) 잔존 여부 확인 |

DB 스토리지 확인 쿼리:

```sql
-- 공유 DB 전체 용량
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

-- 상위 테이블 용량 (증가 주범 식별)
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
```

커넥션 풀 압박 확인 쿼리:

```sql
-- app_api 롤의 활성/유휴 커넥션 분포 (DB_POOL_MAX와 대조)
SELECT state, count(*)
FROM pg_stat_activity
WHERE usename = 'app_api'
GROUP BY state;
```

### LiveKit Cloud

LiveKit 콘솔 → "Usage" → "Alerts"에서 3단계 알림 설정.

| 단계 | 조치 |
|---|---|
| 무료 티어 50% | 음성 활성화 유저 분포 확인 |
| 무료 티어 80% | 세션 최대 길이 60분 락 동작 확인 |
| 무료 티어 100% | 음성 기능 일시 제한 또는 유료 전환 |

---

## 헬스체크

| 항목 | 확인 방법 | 주기 |
|---|---|---|
| API 서버 헬스 | `GET /api/health` → `{ "status": "ok" }` (NestJS `health.controller`, 인증 불필요) | 1분 간격 프로브 |
| DB 응답 | API 서버에서 `SELECT 1` 왕복 시간 | 일 1회 |
| socket.io 월드 게이트웨이 | `/world` 네임스페이스 접속·`positions` 수신 확인 | 이상 시 즉시 |
| API 서버 에러율 | API 서버 로그의 5xx 비율 | 이상 시 즉시 |
| LiveKit 룸 상태 | LiveKit 콘솔 → "Rooms" | 이상 시 즉시 |
| Mapbox 타일 요청 수 | Mapbox 대시보드 → "Analytics" | 주 1회 |
| Vercel 빌드 상태 | Vercel 대시보드 → "Deployments" | 배포 시마다 |

`GET /api/health`는 브라우저 프록시(`app/api/health`)를 거치지 않고 API 서버를 직접 프로브해도
된다. 무중단 배포·컨테이너 오케스트레이터의 liveness/readiness 프로브 대상이 이 엔드포인트다.

---

## 에러 모니터링

### API 서버 에러율

API 서버 로그에서 5xx 응답과 처리되지 않은 예외를 관측한다. 인증 실패(401/403)는 정상
트래픽에 섞여 있으므로 급증 여부만 본다. 결제 웹훅(`billing`)과 발급 워커
(`fulfillment.worker`)의 에러는 매출과 직결되므로 별도 알림 대상으로 둔다.

주요 관측 포인트:
- 웹훅 서명 검증 실패(잘못된 `PG_WEBHOOK_SECRET` 또는 위조 요청)
- 발급 워커 재시도 누적(`orders.fulfill_attempts` 증가)
- DB 커넥션 획득 타임아웃(풀 고갈)

### 결제 실패 감지

`orders` 테이블에서 `status = 'FAILED'` 레코드를 주기적으로 확인합니다.

```sql
-- 최근 24시간 결제 실패 건
SELECT id, user_id, product_type, amount_krw, fail_reason, created_at
FROM orders
WHERE status = 'FAILED'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```

### 광고 노출 이상 감지

```sql
-- 광고주별 일일 노출 수 집계 (예상치 대비 이상 저조 시 렌더링 로직 점검)
SELECT b.id, b.advertiser_id, COUNT(i.id) AS impressions_today
FROM sponsor_buildings b
LEFT JOIN ad_impressions i ON i.building_id = b.id
  AND i.impressed_at::date = CURRENT_DATE
WHERE b.is_active = true
GROUP BY b.id, b.advertiser_id
ORDER BY impressions_today;
```

---

## 관련 문서

- [과금 방어 대응](./runbook/billing-guard.md)
- [배포 절차](./runbook/deploy.md)
- [API 키 설정](../onboarding/api-keys.md)
