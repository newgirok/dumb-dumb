-- 행 레벨 보안 (RLS)
--
-- Supabase에서는 브라우저가 DB를 직접 때리니 RLS가 유일한 방벽이었지만,
-- 이제 API 서버가 앞에 서므로 1차 방어는 애플리케이션(가드 + 리포지토리)이
-- 한다. RLS는 그 아래 깔아두는 2차 방어다 — 쿼리에서 WHERE 한 줄을
-- 빠뜨려도 DB가 막아준다.
--
-- 컨텍스트는 세션 변수로 넘긴다. API가 요청마다 트랜잭션 안에서
--   SET LOCAL app.user_id = '<uuid>';
--   SET LOCAL app.user_role = 'user' | 'advertiser' | 'admin';
-- 를 실행하고, 정책은 그 값을 읽는다.
--
-- ⚠ 커넥션 풀 주의: SET LOCAL 은 트랜잭션 범위라 트랜잭션이 끝나면 자동으로
-- 풀린다. 반드시 트랜잭션 안에서 써야 하며, SET(LOCAL 없이)을 쓰면 풀에
-- 반납된 커넥션에 값이 남아 다음 요청이 남의 컨텍스트를 물려받는다.

-- 세션 변수를 안전하게 읽는 헬퍼. 미설정이면 NULL을 돌려준다
-- (current_setting의 두 번째 인자 true = missing_ok)
CREATE OR REPLACE FUNCTION app_user_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_user_role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.user_role', true), ''), 'anon');
$$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT app_user_role() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- users — 본인 행만. 관리자는 전체
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_select ON users
  FOR SELECT USING (id = app_user_id() OR app_is_admin());

CREATE POLICY users_self_update ON users
  FOR UPDATE USING (id = app_user_id() OR app_is_admin());

-- 가입은 서버가 수행한다 (아직 로그인 전이라 user_id 컨텍스트가 없다)
CREATE POLICY users_admin_insert ON users
  FOR INSERT WITH CHECK (app_is_admin());

-- ---------------------------------------------------------------------------
-- characters / orders / user_licenses — 본인 것만
-- ---------------------------------------------------------------------------
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY characters_owner_select ON characters
  FOR SELECT USING (owner_id = app_user_id() OR app_is_admin());

CREATE POLICY characters_owner_update ON characters
  FOR UPDATE USING (owner_id = app_user_id() OR app_is_admin());

-- 발급은 서버(워커)만 한다. 유저가 직접 INSERT 할 수 없다
CREATE POLICY characters_admin_insert ON characters
  FOR INSERT WITH CHECK (app_is_admin());

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_owner_select ON orders
  FOR SELECT USING (user_id = app_user_id() OR app_is_admin());

-- 주문 생성은 본인 것만, 상태 변경(PAID 등)은 결제 웹훅(admin)만
CREATE POLICY orders_owner_insert ON orders
  FOR INSERT WITH CHECK (user_id = app_user_id());

CREATE POLICY orders_admin_update ON orders
  FOR UPDATE USING (app_is_admin());

ALTER TABLE user_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY licenses_owner_select ON user_licenses
  FOR SELECT USING (user_id = app_user_id() OR app_is_admin());

CREATE POLICY licenses_admin_write ON user_licenses
  FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

-- ---------------------------------------------------------------------------
-- sponsor_buildings — B2B 테넌시 경계. 여기가 RLS의 핵심이다.
-- 광고주 A가 B의 집행 내역을 보면 계약·정산 사고다.
-- 단, 활성 광고는 게임 렌더링에 필요하므로 누구나 읽을 수 있어야 한다.
-- ---------------------------------------------------------------------------
ALTER TABLE sponsor_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY sponsor_public_active_select ON sponsor_buildings
  FOR SELECT USING (is_active = true);

CREATE POLICY sponsor_owner_select ON sponsor_buildings
  FOR SELECT USING (advertiser_id = app_user_id() OR app_is_admin());

CREATE POLICY sponsor_owner_write ON sponsor_buildings
  FOR ALL USING (advertiser_id = app_user_id() OR app_is_admin())
  WITH CHECK (advertiser_id = app_user_id() OR app_is_admin());

-- ---------------------------------------------------------------------------
-- ad_impressions — 광고주는 자기 건물의 노출만. 정산 근거라 수정 불가
-- ---------------------------------------------------------------------------
ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY impressions_advertiser_select ON ad_impressions
  FOR SELECT USING (
    app_is_admin()
    OR EXISTS (
      SELECT 1 FROM sponsor_buildings b
      WHERE b.id = ad_impressions.building_id
        AND b.advertiser_id = app_user_id()
    )
  );

-- 노출 기록은 서버만 남긴다
CREATE POLICY impressions_admin_insert ON ad_impressions
  FOR INSERT WITH CHECK (app_is_admin());

-- ---------------------------------------------------------------------------
-- 주의: 테이블 소유자와 SUPERUSER 는 기본적으로 RLS를 우회한다.
-- API 서버는 반드시 소유자가 아닌 전용 롤로 접속해야 정책이 적용된다.
-- ---------------------------------------------------------------------------
CREATE ROLE app_api NOLOGIN;
GRANT USAGE ON SCHEMA public TO app_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_api;

-- 권한 상승 차단.
-- users_self_update 는 행 단위 정책이라 "본인 행"까지만 막는다. 즉 유저가
-- 자기 행의 role 을 'admin' 으로 바꾸는 건 RLS로 못 막는다. 컬럼 단위
-- 권한으로 role 수정 자체를 차단한다. 역할 변경은 운영 경로(소유자 접속)로만.
REVOKE UPDATE ON users FROM app_api;
GRANT UPDATE (email, password_hash, nickname, token_version, updated_at)
  ON users TO app_api;
