# 보안 규격

---

## JWT 구조 및 가시거리 라이선스 인코딩

### 토큰 이중 구조

| 토큰 | 수명 | 시크릿 | 저장 위치 | 용도 |
|---|---|---|---|---|
| Access Token | 15분 | `JWT_ACCESS_SECRET` | 브라우저 메모리 | API 인증, DB 조회 없이 서명만 검증 |
| Refresh Token | 30일 | `JWT_REFRESH_SECRET` | httpOnly 쿠키 (Next 라우트 관리) | Access Token 만료 시 재발급 |

- 액세스/리프레시 시크릿은 서로 다른 값으로 분리한다.
- Access Token은 자가 검증(Self-Contained)으로, 모든 요청에서 DB를 거치지 않고 서명 검증만으로 인증이 완료된다. WebSocket 접속에 필요해 JS가 읽어야 하므로 브라우저 메모리에 둔다.
- Refresh Token은 httpOnly 쿠키로만 관리하며 Next.js Route Handler가 설정·갱신·삭제한다(JS 접근 불가).
- `users.token_version` 컬럼으로 해당 유저의 모든 토큰을 일괄 폐기한다(비밀번호 변경·강제 로그아웃 시 증가).

### 가시거리 등급 Stateless 인코딩

가시거리 라이선스 등급은 JWT Payload에 직접 인코딩하여 Stateless 검증한다. 이동할 때마다 DB를 조회하지 않고 토큰 디코딩만으로 가시거리를 즉시 판별한다.

```json
// JWT Payload 예시
{
  "sub": "user-uuid-here",
  "email": "user@example.com",
  "role": "user",
  "visibility_radius_m": 100,
  "iat": 1720000000,
  "exp": 1720000900
}
```

라이선스 구매 완료 시 Refresh Token으로 토큰을 즉시 재발급하여 새 등급을 반영한다.

---

## 토큰 보안 규칙

- Access Token은 브라우저 메모리에만 저장 (localStorage 저장 금지)
- Refresh Token은 httpOnly 쿠키로만 보관, 클라이언트 JS 직접 접근 불가
- 로그인은 Basic(`이메일:비밀번호` base64), 이후 요청은 Bearer 액세스 토큰
- 소셜 로그인(카카오/구글)은 OAuth 2.0 Authorization Code 흐름이며 코드 교환은 전부 서버에서 수행
- 토큰 만료 또는 변조 감지 시 즉시 세션 파기 후 로그인 화면으로 강제 리다이렉트

---

## RLS (Row Level Security)

API 서버(가드 + 리포지토리)가 1차 방어, PostgreSQL **RLS가 2차 방어**다. API는 테이블 소유자가 아닌 전용 롤 **`app_api`**로 접속해야 RLS가 적용된다(`DATABASE_URL`은 반드시 `app_api` 롤).

### 요청 컨텍스트 주입

요청마다 트랜잭션 안에서 `set_config($1, $2, true)`(즉 `SET LOCAL`)로 `app.user_id`, `app.user_role`를 넣고, 정책 함수 `app_user_id()`가 이를 읽는다. **반드시 트랜잭션 범위**여야 하며 전역 `SET`은 금지한다(커넥션 풀에 컨텍스트가 남아 유출).

```sql
-- characters: 본인 캐릭터만 조회 가능
CREATE POLICY "own characters only" ON characters
  FOR SELECT USING (owner_id = app_user_id());

-- orders: 본인 주문만 조회 가능
CREATE POLICY "own orders only" ON orders
  FOR SELECT USING (user_id = app_user_id());

-- sponsor_buildings: 활성 광고는 렌더링 위해 누구나 SELECT
CREATE POLICY "read active buildings" ON sponsor_buildings
  FOR SELECT USING (is_active = true);

-- sponsor_buildings: 광고주는 자기 소유 구좌만 관리 (테넌시 격리)
CREATE POLICY "advertiser owns buildings" ON sponsor_buildings
  FOR ALL USING (advertiser_id = app_user_id());
```

### 핵심 정책

- RLS의 핵심은 **광고주 간 테넌시 격리**(`sponsor_buildings`, `ad_impressions`). 활성 광고(`is_active=true`)만 누구나 SELECT 가능하고, 그 외 광고주 데이터는 본인만 접근한다.
- `users.role` 컬럼은 컬럼 단위 권한으로 수정을 차단(권한 상승 방지)한다. 역할 변경은 운영 경로로만.
- 서버 전용 작업(결제 웹훅·발급 워커)은 admin 컨텍스트(`withAdmin`)로 RLS를 우회한다.

---

## 오브젝트 스토리지 (GLB/텍스처)

- GLB 캐릭터 에셋과 광고주 텍스처는 오브젝트 스토리지에 두고, 클라이언트는 서버가 발급한 URL(`glb_url`, `texture_url`)로만 접근한다.
- 업로드(쓰기)는 서버 경로에서만 수행하고, 클라이언트 직접 업로드는 허용하지 않는다.

---

## 결제 보안

- PG 웹훅 서명(HMAC) 검증 필수 — `PG_WEBHOOK_SECRET`. 서명 검증을 위해 **raw body를 보존**한다.
- 멱등성은 DB 제약으로 보장 — `orders_pg_approval_uniq`(승인번호 UNIQUE), `characters_order_item_uniq`(묶음 상품 발급 UNIQUE). 중복 웹훅은 제약 위반으로 흡수되어 단 1회만 발급된다.
- 발급은 트랜잭션 내에서 처리하고, 실패 시 주문 상태를 `FAILED`로 전이 + PG사 자동 취소를 호출한다.

---

## Mapbox API 토큰 보안

- 웹 토큰: 허가된 도메인(`https://*.서비스주소.com`)으로만 작동하도록 Allowed URLs 락
- 모바일 토큰: 앱 Bundle ID / Package Name 매칭 제한 (무단 도용 차단)
- 토큰 노출 시: Mapbox 대시보드에서 즉시 Revoke 후 재발급

---

## 관련 문서

- [개발 컨벤션](../conventions.md)
- [ADR 004 — 결제 구조](../../adr/004-direct-krw-payment.md)
- [비즈니스 규칙 — 결제 규칙](../../product/business-rules.md)
