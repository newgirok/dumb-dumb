-- 묶음 상품 발급
--
-- 0008 의 characters_order_uniq 는 "주문 1건 = 캐릭터 1개"를 강제한다.
-- 10종 묶음(bundle_10)을 팔기로 했으니 주문 안에서 몇 번째 항목인지까지
-- 넣어 유니크를 잡는다. 멱등성은 그대로 DB가 보장한다 — 워커가 중복
-- 실행돼도 (order_id, order_seq) 가 겹쳐 두 번째 INSERT 가 실패한다.

ALTER TABLE characters ADD COLUMN order_seq INTEGER;

DROP INDEX characters_order_uniq;

CREATE UNIQUE INDEX characters_order_item_uniq
  ON characters (order_id, order_seq)
  WHERE order_id IS NOT NULL;

-- 워커가 캐릭터 상품만 집던 인덱스를 전 상품으로 넓힌다.
-- 라이선스 주문도 발급(가시거리 상향) 대상이기 때문이다
DROP INDEX idx_orders_pending_fulfillment;

CREATE INDEX idx_orders_pending_fulfillment
  ON orders (status, created_at)
  WHERE status = 'PAID' AND fulfilled_at IS NULL;
