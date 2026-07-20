-- 최진우 테스트 계약서 삭제
DELETE FROM contracts WHERE worker_id = 44;

-- 정준희: 구 workers.id=43 계약서 -> 실사용 중인 staff_profiles.id=21 (store_id=1, 배정 21건)
UPDATE contracts SET worker_id = 21 WHERE worker_id = 43;

-- 차지현: 구 workers.id=37 계약서 -> staff_profiles.id=20
UPDATE contracts SET worker_id = 20 WHERE worker_id = 37;

-- 구민정: 구 workers.id=41 데이터로 새 staff_profiles(inactive) 생성 후 계약서 재연결
WITH new_staff AS (
  INSERT INTO staff_profiles (
    name, phone, bank_name, bank_account, staff_role, store_id,
    preferred_shift_ids, preferred_days, available_ranges,
    has_health_cert, wants_insurance, hourly_rate, status, user_profile_id
  )
  VALUES (
    '구민정', '01098798349', '카카오뱅크', '3333172062404', 'cashier', NULL,
    '{}', '{}', '[]'::jsonb,
    false, false, 12500, 'inactive', '1ba0a34f-70c9-40cb-8a5c-e2142ec3d90c'
  )
  RETURNING id
)
UPDATE contracts SET worker_id = (SELECT id FROM new_staff) WHERE worker_id = 41;

-- 임은지: 구 workers.id=42 데이터로 새 staff_profiles(inactive) 생성 후 계약서 재연결
WITH new_staff AS (
  INSERT INTO staff_profiles (
    name, phone, bank_name, bank_account, staff_role, store_id,
    preferred_shift_ids, preferred_days, available_ranges,
    has_health_cert, wants_insurance, hourly_rate, status, user_profile_id
  )
  VALUES (
    '임은지', '01046146061', '우리은행', '1002349555522', 'cashier', NULL,
    '{}', '{}', '[]'::jsonb,
    false, false, 10320, 'inactive', '2f9dbc1e-8e81-4d6a-be08-18c800499dd4'
  )
  RETURNING id
)
UPDATE contracts SET worker_id = (SELECT id FROM new_staff) WHERE worker_id = 42;

-- worker_id=18 (전용준)은 staff_profiles.id=18과 이미 동일하므로 값 변경 불필요
