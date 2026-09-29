CREATE TABLE ad_impressions (
  id           BIGSERIAL PRIMARY KEY,
  building_id  BIGINT      NOT NULL REFERENCES sponsor_buildings(id),
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  impressed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ad_impressions_building ON ad_impressions (building_id);
