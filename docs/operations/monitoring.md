# 모니터링

---

## 비용 알림 설정

### Mapbox

Mapbox 대시보드 → "Billing" → "Budget alerts"에서 3단계 알림을 설정합니다.

Mapbox 사용량은 두 곳에서 나온다. 둘 다 같은 `NEXT_PUBLIC_MAPBOX_TOKEN`을 쓴다.

| 사용처 | Map load 발생 | 타일 요청 특성 |
|---|---|---|
| 루트 3D 씬 5시 GIS 미니맵 | 루트 진입 후 인트로가 끝날 때마다 1회 | 줌 16 고정·조작 불가라 유저 주변만 요청. GPS 갱신마다 중심만 이동 |
| 대시보드 월드 지도 | `/dashboard` 진입마다 1회 | Standard 3D 건물 포함, 유저가 줌 14~20을 조작 가능. 캐릭터 이동(PC 키보드·모바일 GPS)을 따라 중심이 이동 |

| 단계 | 임계치 | 조치 |
|---|---|---|
| 경고 | 무료 티어의 50% | 트래픽 패턴 확인 (루트 방문 vs 대시보드 진입 비중) |
| 주의 | 무료 티어의 80% | 대시보드 월드 줌 범위(14~20)·타일 캐시 정책 점검 |
| 차단 | 무료 티어의 100% | Rate Limit + Billing Hard Cap 즉시 적용 |

무료 티어 초과 원인 주요 용의자:
- Mapbox 토큰 도용 (도메인 락 미설정)
- 대시보드 월드에서 최소 줌(14)까지 줌아웃해 넓은 지역 타일 대량 요청
- 언마운트 시 `map.remove()`가 빠져 지도 인스턴스가 누적 (미니맵·대시보드 월드 모두 언마운트 시 호출한다)

### 자체 PostgreSQL + API 서버

호스팅은 정액 요금제에 묶이지 않으므로, 벤더 청구서 대신 **자원 사용량 지표**를 직접
관측해 임계치에서 대응한다. DB와 API 서버는 하나의 공유 인스턴스를 바라보므로 두 계층을
함께 본다.

| 지표 | 확인 방법 | 임계치 | 조치 |
|---|---|---|---|
| DB 스토리지 | `pg_database_size()` | 프로비저닝 용량의 80% | 오래된 `ad_impressions` 파티셔닝·아카이빙 검토 |
| 커넥션 풀 사용률 | `pg_stat_activity` vs `DB_POOL_MAX` | 활성 커넥션이 풀 상한의 80% | `DB_POOL_MAX` 상향, 누수 쿼리 추적 (API 서버 수평 확장은 게이트웨이 단일 인스턴스 제약 해소 뒤 — [비용 방어 런북](./runbook/billing-guard.md)) |
| socket.io 동시 연결 | 월드 게이트웨이(`/world`) 접속 소켓 수 — 대시보드 월드 접속자만 해당 | 인스턴스당 500 concurrent | 섹터 이탈 채널 해제 로직 점검, 단일 인스턴스 수직 확장 (스케일아웃은 socket.io 어댑터·위치 상태 공유 구현 뒤) |
| 활성 섹터 채널 수 | 게이트웨이가 방송 중인 섹터(room) 수 (500m 위경도 격자) | 급증 패턴 | 유령 채널(빈 섹터) 잔존 여부 확인 |

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

LiveKit 콘솔 → "Usage" → "Alerts"에서 3단계 알림 설정. 음성은 대시보드 월드에서만 쓰이며, 룸은 섹터마다 하나(`voice-sector-<gx>-<gy>`)다.

| 단계 | 조치 |
|---|---|
| 무료 티어 50% | 음성 활성화 유저 분포·섹터별 룸 인원 확인 |
| 무료 티어 80% | 구독 상한(가까운 8명·40m 이내) 동작 확인. 세션 길이 상한은 코드에 없으므로 필요 시 [과금 방어 대응](./runbook/billing-guard.md) 절차로 건다 |
| 무료 티어 100% | 음성 기능 일시 제한 또는 유료 전환 |

---

## 헬스체크

| 항목 | 확인 방법 | 주기 |
|---|---|---|
| API 서버 헬스 | API 서버 `GET /health` → `{ "status": "ok" }` (NestJS `health.controller`, 인증 불필요) | 1분 간격 프로브 |
| 프론트 서버 헬스 | 웹 `GET /api/health` → `{ "status": "ok" }` (Next Route Handler 자체 응답, API 서버를 호출하지 않음) | 1분 간격 프로브 |
| DB 응답 | API 서버에서 `SELECT 1` 왕복 시간 | 일 1회 |
| socket.io 월드 게이트웨이 | `/world` 네임스페이스 접속·`positions` 수신 확인. `positions`는 한 섹터에 2명 이상일 때만 방송되므로 같은 섹터에 두 클라이언트를 붙여 본다 | 이상 시 즉시 |
| API 서버 에러율 | API 서버 로그의 5xx 비율 | 이상 시 즉시 |
| LiveKit 룸 상태 | LiveKit 콘솔 → "Rooms" | 이상 시 즉시 |
| Mapbox 타일 요청 수 | Mapbox 대시보드 → "Analytics" | 주 1회 |
| Vercel 빌드 상태 | Vercel 대시보드 → "Deployments" | 배포 시마다 |

API 서버의 무중단 배포·컨테이너 오케스트레이터 liveness/readiness 프로브 대상은 API 서버
`GET /health`다. 웹의 `/api/health`는 Next 서버가 살아 있는지만 알려 주므로 API 서버 상태 판단에
쓰지 않는다.

---

## 에러 모니터링

### API 서버 에러율

API 서버 로그에서 5xx 응답과 처리되지 않은 예외를 관측한다. 인증 실패(401/403)는 정상
트래픽에 섞여 있으므로 급증 여부만 본다. 결제 웹훅(`billing`)과 발급 워커
(`fulfillment.worker`)의 에러는 매출과 직결되므로 별도 알림 대상으로 둔다.

주요 관측 포인트:
- 웹훅 서명 검증 실패(잘못된 `PG_WEBHOOK_SECRET` 또는 위조 요청) — `401`
- 결제 금액 불일치·이미 사용된 승인번호 로그
- 발급 워커 재시도 누적(아바타 외형 충돌 시 `orders.fulfill_attempts` 증가)
- 지급 방법이 없는 상품 로그("지급 방법이 없는 상품")
- DB 커넥션 획득 타임아웃(풀 고갈)

### 지급 정체 감지

웹훅은 주문을 `PAID`로만 바꾸고 지급은 발급 워커가 처리한다. 코드가 주문을 `FAILED`로 전이시키지
않으므로, 결제 이상은 **결제됐는데 지급되지 않은 주문**으로 찾는다. 외형 충돌이 8회에 도달한
주문(`fulfill_attempts >= 8`)은 워커 대상에서 빠지므로 수동 처리가 필요하다.

```sql
-- 결제 후 10분이 지나도록 지급되지 않은 주문
SELECT id, user_id, product_type, amount_krw, fulfill_attempts, completed_at
FROM orders
WHERE status = 'PAID'
  AND fulfilled_at IS NULL
  AND (fulfill_attempts >= 8 OR completed_at < now() - interval '10 minutes')
ORDER BY completed_at;
```

### 광고 노출 이상 감지

스폰서 노출 기록(`ad_impressions`)은 Phase 5 스폰서 기능과 함께 쌓이기 시작한다. 그 뒤 광고주별
일일 노출을 이 쿼리로 본다.

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
