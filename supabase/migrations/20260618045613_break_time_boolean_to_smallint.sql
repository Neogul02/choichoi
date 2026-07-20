ALTER TABLE schedule_slots ALTER COLUMN break_time DROP DEFAULT;
ALTER TABLE schedule_slots ALTER COLUMN break_time TYPE smallint USING (break_time::int * 60);
ALTER TABLE schedule_slots ALTER COLUMN break_time SET DEFAULT 0;
