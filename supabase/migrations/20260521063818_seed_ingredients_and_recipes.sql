
-- 재료 시드 데이터
insert into ingredients (id, name, category, color, unit_type, base_unit, container_unit, container_size, reorder_at_containers, sort_order)
values
  ('bread',       '식빵',       '빵',    '#F5E6C8', 'count',  '장', '봉지', 12,   2, 10),
  ('cream',       '생크림',     '크림',  '#FFFDE7', 'weight', 'g',  '팩',   1000, 2, 20),
  ('mascarpone',  '마스카포네', '크림',  '#FFF9C4', 'weight', 'g',  '통',   500,  2, 30),
  ('sugar',       '설탕',       '크림',  '#F3F4F6', 'weight', 'g',  '봉지', 1000, 1, 40),
  ('strawberry',  '딸기',       '과일',  '#FFB3BA', 'weight', 'g',  '박스', 2000, 2, 50),
  ('melon',       '메론',       '과일',  '#B5EAD7', 'weight', 'g',  '박스', 2000, 2, 60),
  ('mango',       '망고',       '과일',  '#FFD700', 'weight', 'g',  '박스', 1000, 2, 70),
  ('kiwi',        '키위',       '과일',  '#C7E4A3', 'weight', 'g',  '팩',   500,  2, 80),
  ('cooling_bag', '보냉백',     '패키지','#E0E7FF', 'count',  '개', '박스', 50,   1, 90)
on conflict (id) do nothing;

-- 레시피 시드 데이터 (menu_items.id: 딸기=9, 메론=11, 후르츠=12, 망고=14, 보냉백=16)
insert into recipes (menu_id, ingredient_id, qty_per_unit) values
  -- 딸기산도 (id=9)
  (9,  'bread',       2),
  (9,  'cream',      60),
  (9,  'mascarpone', 20),
  (9,  'sugar',      10),
  (9,  'strawberry', 40),
  (9,  'cooling_bag', 1),
  -- 메론산도 (id=11)
  (11, 'bread',       2),
  (11, 'cream',      60),
  (11, 'mascarpone', 20),
  (11, 'sugar',      10),
  (11, 'melon',      60),
  (11, 'cooling_bag', 1),
  -- 후르츠산도 (id=12)
  (12, 'bread',       2),
  (12, 'cream',      70),
  (12, 'mascarpone', 25),
  (12, 'sugar',      12),
  (12, 'strawberry', 20),
  (12, 'mango',      20),
  (12, 'kiwi',       20),
  (12, 'cooling_bag', 1),
  -- 망고산도 (id=14)
  (14, 'bread',       2),
  (14, 'cream',      60),
  (14, 'mascarpone', 20),
  (14, 'sugar',      10),
  (14, 'mango',      60),
  (14, 'cooling_bag', 1),
  -- 보냉백 추가 (id=16)
  (16, 'cooling_bag', 1)
on conflict do nothing;
