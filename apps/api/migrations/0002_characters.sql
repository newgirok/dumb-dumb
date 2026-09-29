CREATE TYPE order_product AS ENUM ('character', 'license_100m', 'license_300m', 'bundle_10');
CREATE TYPE order_status  AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE characters (
  id              BIGSERIAL PRIMARY KEY,
  serial_number   VARCHAR(32)  UNIQUE NOT NULL,
  owner_id        UUID         NOT NULL REFERENCES auth.users(id),
  appearance_hash CHAR(64)     UNIQUE NOT NULL,
  appearance_data JSONB        NOT NULL,
  glb_url         TEXT,
  is_equipped     BOOLEAN      DEFAULT false,
  created_at      TIMESTAMPTZ  DEFAULT now()
);

CREATE TABLE orders (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL REFERENCES auth.users(id),
  product_type       order_product NOT NULL,
  amount_krw         INTEGER      NOT NULL,
  status             order_status  NOT NULL DEFAULT 'PENDING',
  pg_approval_number TEXT,
  fail_reason        TEXT,
  created_at         TIMESTAMPTZ  DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

CREATE TABLE user_licenses (
  user_id             UUID     PRIMARY KEY REFERENCES auth.users(id),
  visibility_radius_m INTEGER  NOT NULL DEFAULT 25,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- 신규 유저 가입 시 기본 라이선스(반경 25m) 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_licenses (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
