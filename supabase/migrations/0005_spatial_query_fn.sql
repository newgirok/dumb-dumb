-- ST_DWithin 기반 반경 내 스폰서 건물 조회 RPC
-- GiST 인덱스(idx_sponsor_buildings_geom)가 자동으로 사용됨
CREATE OR REPLACE FUNCTION nearby_sponsor_buildings(
  p_lng      float8,
  p_lat      float8,
  p_radius_m float8 DEFAULT 500
)
RETURNS TABLE (
  id                bigint,
  advertiser_id     uuid,
  mapbox_feature_id text,
  texture_url       text,
  lng               float8,
  lat               float8,
  distance_m        float8
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sb.id,
    sb.advertiser_id,
    sb.mapbox_feature_id,
    sb.texture_url,
    ST_X(sb.geom)                                               AS lng,
    ST_Y(sb.geom)                                               AS lat,
    ST_Distance(
      sb.geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )                                                           AS distance_m
  FROM sponsor_buildings sb
  WHERE
    sb.is_active = true
    AND ST_DWithin(
      sb.geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  ORDER BY distance_m;
END;
$$;
