-- 옛 auth.users 참조를 받아 주는 빈 스텁
--
-- 0002·0004는 자체 인증(0006) 이전, Supabase Auth가 소유한 auth.users를
-- 참조하도록 쓴 마이그레이션이다. 적용한 마이그레이션은 고치지 않으므로, 그
-- 테이블이 없는 PostgreSQL에서도 순서대로 돌도록 빈 테이블을 먼저 만든다.
-- 0006이 참조를 자체 users로 옮긴 뒤로는 아무도 쓰지 않는다.
-- 이미 있으면(예전 DB) 아무 일도 하지 않는다.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
