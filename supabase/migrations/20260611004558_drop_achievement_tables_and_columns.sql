
DROP TABLE IF EXISTS worker_achievements;
DROP TABLE IF EXISTS achievements;
ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS active_title_key,
  DROP COLUMN IF EXISTS title_color;
