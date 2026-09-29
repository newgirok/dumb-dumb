-- auth.users 빈 스텁
--
-- 0002·0004의 외래 키가 auth.users를 가리키고, 0006이 이 참조를 users로 옮긴다.
-- 적용한 마이그레이션은 고치지 않으므로, auth.users가 없는 PostgreSQL에서도
-- 0000부터 순서대로 돌도록 빈 테이블을 먼저 만든다. 이미 있으면 아무 일도 하지 않는다.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
