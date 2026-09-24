# 보안 규격

---

## JWT 구조

### 토큰 이중 구조

| 토큰 | 수명 | 시크릿 | 저장 위치 | 용도 |
|---|---|---|---|---|
| Access Token | 15분 | `JWT_ACCESS_SECRET` | 브라우저 메모리 | API·월드 소켓 인증, DB 조회 없이 서명만 검증 |
| Refresh Token | 30일 | `JWT_REFRESH_SECRET` | httpOnly 쿠키 `refresh_token` (Next 라우트 관리) | Access Token 만료 시 재발급 |

- 액세스/리프레시 시크릿은 서로 다른 값으로 분리한다.
- Access Token은 자가 검증(Self-Contained)으로, 전역 가드(`AccessTokenGuard`)가 DB를 거치지 않고 서명 검증만으로 인증을 끝낸다. 월드 소켓 접속에 필요해 JS가 읽어야 하므로 브라우저 메모리에 둔다.
- Refresh Token은 httpOnly 쿠키(프로덕션 `secure`, `sameSite=lax`, 30일)로만 관리하며 Next.js Route Handler가 설정·갱신·삭제한다(JS 접근 불가).
- `users.token_version` 컬럼으로 해당 유저의 리프레시 토큰을 일괄 폐기한다. 로그아웃(`POST /auth/logout`)은 모든 기기 로그아웃으로 동작해 이 값을 올린다. 폐기 판정은 리프레시 시점에 토큰의 `ver`와 대조해 이뤄지므로, 이미 발급된 액세스 토큰은 만료(최대 15분)까지 유효하다.

### Payload

```json
// 액세스 토큰 payload 예시
{
  "sub": "user-uuid-here",
  "email": "user@example.com",
  "role": "user",
  "type": "access",
  "iat": 1720000000,
  "exp": 1720000900
}
```

- `role`은 `user` | `advertiser` | `admin`이다.
- 리프레시 토큰은 `type: "refresh"`이며, 폐기 판정용 `ver`(발급 시점의 `users.token_version`)를 함께 담는다.
- 토큰 종류(`type`)가 기대와 다르면 검증에 실패한다(리프레시 토큰으로 API를 부를 수 없다).

### 가시거리 라이선스 조회

가시거리 라이선스는 JWT에 담지 않고 DB로 관리한다.

- `user_licenses.visibility_radius_m`: 가입 트랜잭션에서 기본 25m 행을 만들고, 가시거리 상품 지급 시 `GREATEST`로 올린다(낮은 등급을 나중에 사도 줄지 않는다).
- 조회는 `GET /me/license`(BFF `/api/me/license`)이며 RLS로 본인 행만 읽는다. 행이 없으면 25를 돌려준다.
- 상점 화면이 이 값을 표시한다. 두 월드(루트 3D 씬·대시보드 월드)는 이 값을 렌더링에 적용하지 않는다.

---

## 토큰 보안 규칙

- Access Token은 브라우저 메모리에만 저장 (localStorage 저장 금지)
- Refresh Token은 httpOnly 쿠키로만 보관, 클라이언트 JS 직접 접근 불가
- 로그인은 Basic(`이메일:비밀번호` base64), 이후 요청은 Bearer 액세스 토큰
- 소셜 로그인(카카오/구글)은 OAuth 2.0 Authorization Code 흐름이며 코드 교환은 전부 서버에서 수행
- 월드 소켓은 액세스 토큰을 socket.io 핸드셰이크 `auth.token`으로 보낸다. 쿼리스트링에 담지 않는다(접속 로그에 남는다). 토큰이 없거나 무효면 게이트웨이가 즉시 끊는다
- LiveKit 룸 토큰은 NestJS `voice` 모듈이 발급한다. `identity`는 클라이언트가 보내지 않고 서버가 액세스 토큰의 유저 id로 채우며(사칭 방지), 룸 이름은 `voice-sector-<gx>-<gy>` 형식만 허용하고, 토큰 TTL은 1시간이다
- API가 401을 돌려주면 클라이언트는 `/api/auth/refresh`로 한 번 갱신한 뒤 재시도한다. 리프레시가 실패하면 메모리의 액세스 토큰을 비우고 리프레시 쿠키를 삭제한다. 페이지 라우트 게이팅이 꺼져 있어 로그인 화면으로 자동 이동하지는 않는다

---

## RLS (Row Level Security)

API 서버(가드 + 리포지토리)가 1차 방어, PostgreSQL **RLS가 2차 방어**다. API는 테이블 소유자가 아닌 전용 롤 **`app_api`**로 접속해야 RLS가 적용된다(`DATABASE_URL`은 반드시 `app_api` 롤).

### 요청 컨텍스트 주입

요청마다 트랜잭션 안에서 `set_config($1, $2, true)`(즉 `SET LOCAL`)로 `app.user_id`, `app.user_role`를 넣고, 정책 함수 `app_user_id()`·`app_user_role()`·`app_is_admin()`이 이를 읽는다(역할이 없으면 `anon`). **반드시 트랜잭션 범위**여야 하며 전역 `SET`은 금지한다(커넥션 풀에 컨텍스트가 남아 유출).

```sql
-- characters: 본인 캐릭터만 조회 (admin 컨텍스트는 전체)
CREATE POLICY characters_owner_select ON characters
  FOR SELECT USING (owner_id = app_user_id() OR app_is_admin());

-- orders: 본인 주문만 조회, 본인 명의로만 생성
CREATE POLICY orders_owner_select ON orders
  FOR SELECT USING (user_id = app_user_id() OR app_is_admin());
CREATE POLICY orders_owner_insert ON orders
  FOR INSERT WITH CHECK (user_id = app_user_id());

-- sponsor_buildings: 활성 광고는 누구나 SELECT
CREATE POLICY sponsor_public_active_select ON sponsor_buildings
  FOR SELECT USING (is_active = true);

-- sponsor_buildings: 광고주는 자기 소유 구좌만 관리 (테넌시 격리)
CREATE POLICY sponsor_owner_write ON sponsor_buildings
  FOR ALL USING (advertiser_id = app_user_id() OR app_is_admin())
  WITH CHECK (advertiser_id = app_user_id() OR app_is_admin());
```

### 핵심 정책

- RLS의 핵심은 **광고주 간 테넌시 격리**(`sponsor_buildings`, `ad_impressions`). 활성 광고(`is_active=true`)만 누구나 SELECT 가능하고, 그 외 광고주 데이터는 본인만 접근한다. `ad_impressions` 기록은 admin 컨텍스트만 INSERT한다.
- `users`·`characters`는 본인 행 조회·수정, `orders`는 본인 주문 조회·생성, `user_licenses`는 본인 행 조회만 허용한다. 유저 생성·캐릭터 발급(INSERT)·주문 상태 갱신·라이선스 쓰기는 admin 컨텍스트만 한다.
- `users.role` 컬럼은 컬럼 단위 권한으로 수정을 차단(권한 상승 방지)한다. `app_api`에는 `email`, `password_hash`, `nickname`, `token_version`, `updated_at`만 UPDATE를 허용한다. 역할 변경은 운영 경로로만.
- 서버 전용 작업(결제 웹훅·발급 워커)은 admin 컨텍스트(`withAdmin`)로 RLS를 우회한다.

정책·권한은 마이그레이션 `0007_rls.sql`에 정의되어 있고, `user_identities`의 정책·권한은 `0009_social_login.sql`, 시리얼 시퀀스 권한은 `0008_billing_pipeline.sql`에 있다.

---

## 오브젝트 스토리지 (GLB/텍스처)

- 캐릭터 GLB와 광고주 텍스처를 오브젝트 스토리지에 두는 경우, 클라이언트는 서버가 발급한 URL(`characters.glb_url`, `sponsor_buildings.texture_url`)로만 접근한다.
- 업로드(쓰기)는 서버 경로에서만 수행하고, 클라이언트 직접 업로드는 허용하지 않는다.
- 발급 캐릭터는 외형 데이터(`appearance_data`)와 해시(`appearance_hash`)만 저장하고 `glb_url`은 채우지 않는다. 두 월드는 `/ref-assets` 정적 에셋으로 캐릭터를 그린다. 스토리지 연동 코드는 아직 없다.

---

## 결제 보안

- PG 웹훅(`POST /billing/webhook`, `@Public`)은 서명으로 검증한다. `x-pg-signature` 헤더가 raw body의 HMAC-SHA256 hex(`PG_WEBHOOK_SECRET`)와 일치해야 하며, 비교는 `timingSafeEqual`로 한다. 서명 검증을 위해 API 서버는 **raw body를 보존**한다(`rawBody: true`).
- 웹훅 본문(`orderId`, `approvalNumber`, `amountKrw`)의 금액이 주문 금액과 다르면 반영하지 않는다.
- 멱등성 — 같은 주문의 중복 웹훅은 주문 행 잠금 뒤 `PAID` 검사로 걸러지고, 같은 승인번호의 다른 주문 반영은 `orders_pg_approval_uniq`(승인번호 UNIQUE)가 막는다. 워커 중복 실행은 `characters_order_item_uniq`(주문별 발급 순번 UNIQUE) 위반과 라이선스 `GREATEST` 갱신으로 흡수되어 단 1회만 발급된다.
- 웹훅은 주문을 `PAID`로만 바꾸고, 지급은 발급 워커가 따로 처리한다. 지급이 반복 실패한 주문은 `PAID`·미지급으로 남아 수동 처리한다. 주문을 `FAILED`로 전이하거나 PG사 결제 취소를 호출하는 코드는 없다.

---

## Mapbox API 토큰 보안

- `NEXT_PUBLIC_MAPBOX_TOKEN` 하나를 대시보드 월드 지도와 루트 3D 씬의 5시 미니맵이 함께 쓰며, 브라우저에 노출된다.
- 웹 토큰: 허가된 도메인(`https://*.서비스주소.com`)으로만 작동하도록 Allowed URLs 락
- 토큰 노출 시: Mapbox 대시보드에서 즉시 Revoke 후 재발급

---

## 관련 문서

- [개발 컨벤션](../conventions.md)
- [ADR 004 — 결제 구조](../../adr/004-direct-krw-payment.md)
- [비즈니스 규칙 — 결제 규칙](../../product/business-rules.md)
