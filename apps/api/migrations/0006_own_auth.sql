-- Supabase Auth 의존 제거 — 자체 users 테이블로 전환
--
-- 기존에는 characters/orders/user_licenses/ad_impressions 가 Supabase가 소유한
-- auth.users 를 참조하고 있어서 Supabase 밖으로 나갈 수 없었다. 자체 users 를
-- 만들고 참조를 그쪽으로 옮긴다.
--
-- FK 자체는 유지한다. "확장성을 위해 FK 제거"는 DB를 샤딩하거나 서비스마다
-- DB를 나눌 때 의미가 있는데, 우리는 Postgres 하나를 공유하기로 했으므로
-- 지금 빼면 얻는 것 없이 고아 행 위험만 진다. 특히 characters 는 2,200원
-- 결제로 발급되는 유니크 자산이라 주인이 사라지면 그 외형은 영원히 재발급
-- 불가다. 나중에 정말 필요하면 DROP CONSTRAINT 한 줄이면 되지만, 반대로
-- 다시 거는 건 이미 생긴 고아 행을 전부 수습해야 해서 훨씬 비싸다.

-- 이메일은 대소문자를 구분하면 안 된다 (Foo@x.com = foo@x.com)
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('user', 'advertiser', 'admin');

CREATE TABLE users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT       UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  nickname      VARCHAR(32)  NOT NULL,
  role          user_role    NOT NULL DEFAULT 'user',
  -- 리프레시 토큰 일괄 폐기용. 비밀번호 변경·로그아웃 시 올리면 기존에
  -- 발급된 리프레시 토큰이 전부 무효가 된다
  token_version INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- auth.users 를 가리키던 참조를 전부 끊는다
ALTER TABLE characters     DROP CONSTRAINT IF EXISTS characters_owner_id_fkey;
ALTER TABLE orders         DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE user_licenses  DROP CONSTRAINT IF EXISTS user_licenses_user_id_fkey;
ALTER TABLE ad_impressions DROP CONSTRAINT IF EXISTS ad_impressions_user_id_fkey;

-- Supabase Auth 가입 훅도 제거. 기본 라이선스 생성은 회원가입 트랜잭션
-- 안에서 애플리케이션이 처리한다
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 자체 users 로 다시 연결
ALTER TABLE characters
  ADD CONSTRAINT characters_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE orders
  ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE user_licenses
  ADD CONSTRAINT user_licenses_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ad_impressions
  ADD CONSTRAINT ad_impressions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 유료 자산과 결제 이력은 유저를 지워도 남아야 하므로 RESTRICT.
-- 탈퇴는 삭제가 아니라 비활성 처리로 다루고, 라이선스·노출 로그는 CASCADE.

-- FK가 자동으로 만들어주지 않는 역방향 조회 인덱스
CREATE INDEX idx_characters_owner    ON characters (owner_id);
CREATE INDEX idx_orders_user         ON orders (user_id);
CREATE INDEX idx_ad_impressions_user ON ad_impressions (user_id);

-- 광고주 → 건물 조회도 자주 쓰인다
CREATE INDEX idx_sponsor_buildings_advertiser ON sponsor_buildings (advertiser_id);

ALTER TABLE sponsor_buildings
  ADD CONSTRAINT sponsor_buildings_advertiser_id_fkey
  FOREIGN KEY (advertiser_id) REFERENCES users(id) ON DELETE RESTRICT;
