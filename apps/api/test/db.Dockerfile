# 통합 테스트용 PostgreSQL — 마이그레이션이 쓰는 확장(PostGIS·pg_cron·pgcrypto·citext)을 모두 갖춘다.
# 공식 이미지에 든 PostgreSQL 저장소(PGDG)에서 PostGIS·pg_cron을 더 깐다(pgcrypto·citext는 기본 포함)
FROM postgres:16-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-16-postgis-3 postgresql-16-cron \
  && rm -rf /var/lib/apt/lists/*

# pg_cron은 서버가 뜰 때 불러야 하고, 예약 작업은 마이그레이션을 적용하는 DB(postgres)에 둔다
CMD ["postgres", "-c", "shared_preload_libraries=pg_cron", "-c", "cron.database_name=postgres"]
