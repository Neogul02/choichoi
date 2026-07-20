
ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_account text DEFAULT NULL;

UPDATE staff_profiles SET sort_order = sub.rn
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM staff_profiles) sub
WHERE staff_profiles.id = sub.id;
