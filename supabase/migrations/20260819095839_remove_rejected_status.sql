ALTER TABLE staff_profiles DROP CONSTRAINT staff_profiles_status_check;
ALTER TABLE staff_profiles ADD CONSTRAINT staff_profiles_status_check CHECK (status = ANY (ARRAY['candidate'::text, 'confirmed'::text, 'inactive'::text]));
