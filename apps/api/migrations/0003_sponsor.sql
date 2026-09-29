CREATE TABLE sponsor_buildings (
  id                  BIGSERIAL PRIMARY KEY,
  advertiser_id       UUID       NOT NULL,
  mapbox_feature_id   TEXT,
  geom                GEOMETRY(Point, 4326) NOT NULL,
  texture_url         TEXT       NOT NULL,
  default_texture_url TEXT,
  is_active           BOOLEAN    DEFAULT false,
  starts_at           TIMESTAMPTZ,
  ends_at             TIMESTAMPTZ
);

CREATE INDEX idx_sponsor_buildings_geom ON sponsor_buildings USING gist(geom);

-- 매일 00:00 KST(= 15:00 UTC) 광고 기간 자동 활성/비활성
SELECT cron.schedule(
  'activate-ads',
  '0 15 * * *',
  $$
    UPDATE sponsor_buildings SET is_active = true  WHERE starts_at::date = CURRENT_DATE;
    UPDATE sponsor_buildings SET is_active = false WHERE ends_at::date   = CURRENT_DATE - 1;
  $$
);
