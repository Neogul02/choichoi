ALTER TABLE roster_shifts
  ADD COLUMN IF NOT EXISTS active_from date,
  ADD COLUMN IF NOT EXISTS active_to   date;
