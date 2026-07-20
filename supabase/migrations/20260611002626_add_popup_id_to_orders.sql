
-- orders 테이블에 popup_id 컬럼 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS popup_id bigint REFERENCES popup_events(id);

-- 기존 주문들 날짜 기반으로 popup_id 백필
UPDATE orders o
SET popup_id = pe.id
FROM popup_events pe
WHERE o.popup_id IS NULL
  AND DATE(o.created_at AT TIME ZONE 'Asia/Seoul') BETWEEN pe.start_date AND pe.end_date;
