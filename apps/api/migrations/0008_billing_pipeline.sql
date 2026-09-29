-- 결제 → 아바타 발급 파이프라인
--
-- 멱등성을 애플리케이션 if 문이 아니라 DB 제약으로 보장한다. PG는 같은
-- 웹훅을 여러 번 보낼 수 있고(재시도), 워커도 중복 실행될 수 있다. 코드로
-- 막으면 동시성에서 뚫리지만 UNIQUE 제약은 안 뚫린다.

-- 같은 승인번호로 두 번 결제 처리되지 않는다.
-- 부분 인덱스라 아직 승인번호가 없는 PENDING 주문 여러 건은 공존 가능.
CREATE UNIQUE INDEX orders_pg_approval_uniq
  ON orders (pg_approval_number)
  WHERE pg_approval_number IS NOT NULL;

-- 주문 하나당 캐릭터 하나. 워커가 두 번 돌아도 두 번째는 INSERT가 실패한다.
ALTER TABLE characters
  ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX characters_order_uniq
  ON characters (order_id)
  WHERE order_id IS NOT NULL;

-- 워커가 처리 대기 주문을 찾을 때 쓰는 인덱스
CREATE INDEX idx_orders_pending_fulfillment
  ON orders (status, product_type, created_at)
  WHERE status = 'PAID';

-- 발급 실패를 추적한다. 시도 횟수가 쌓이면 사람이 봐야 한다는 신호다
ALTER TABLE orders
  ADD COLUMN fulfill_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN fulfilled_at     TIMESTAMPTZ;

-- 시리얼 번호는 전역 순번으로 뽑는다. 채번을 애플리케이션에서 하면
-- 동시 발급 시 충돌하고, 시퀀스는 그 자체로 원자적이다
CREATE SEQUENCE character_serial_seq START 1;

-- 서버(워커)만 발급하므로 admin 컨텍스트에서만 쓴다
GRANT USAGE, SELECT ON SEQUENCE character_serial_seq TO app_api;
