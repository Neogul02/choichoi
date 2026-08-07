ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS resident_reg_no_enc text,
  ADD COLUMN IF NOT EXISTS resident_reg_no_masked text;
