-- 소셜 로그인 (카카오 / 구글)
--
-- Supabase Auth 를 걷어내면서 같이 사라진 기능이다. 자체 구현으로 되살린다.
--
-- 계정과 로그인 수단을 분리한다. users 에 provider 컬럼을 붙이는 방식은
-- "카카오로 가입한 사람이 나중에 구글도 연결"을 못 한다. 같은 사람이
-- 로그인 수단을 여러 개 가질 수 있으니 1:N 테이블로 뺀다.

-- 소셜로만 가입한 유저는 비밀번호가 없다
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TYPE auth_provider AS ENUM ('kakao', 'google');

CREATE TABLE user_identities (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         auth_provider NOT NULL,
  -- 공급자가 발급한 고유 ID. 이메일이 아니라 이것이 신원의 기준이다 —
  -- 이메일은 사용자가 바꿀 수 있고, 카카오는 아예 안 줄 수도 있다
  provider_user_id TEXT          NOT NULL,
  email            CITEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- 같은 공급자 계정이 두 유저에 붙으면 계정 탈취가 된다
  UNIQUE (provider, provider_user_id),
  -- 한 유저가 같은 공급자를 두 번 연결할 이유는 없다
  UNIQUE (user_id, provider)
);

CREATE INDEX idx_user_identities_user ON user_identities (user_id);

ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;

-- 본인이 어떤 계정을 연결해 뒀는지는 볼 수 있어야 한다 (연결 해제 UI)
CREATE POLICY identities_owner_select ON user_identities
  FOR SELECT USING (user_id = app_user_id() OR app_is_admin());

CREATE POLICY identities_owner_delete ON user_identities
  FOR DELETE USING (user_id = app_user_id() OR app_is_admin());

-- 연결 생성은 서버만. 로그인 시점엔 아직 user_id 컨텍스트가 없다
CREATE POLICY identities_admin_insert ON user_identities
  FOR INSERT WITH CHECK (app_is_admin());

GRANT SELECT, INSERT, DELETE ON user_identities TO app_api;
