ALTER TABLE workers ADD COLUMN IF NOT EXISTS user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL;
