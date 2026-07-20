ALTER TABLE workers ADD COLUMN worker_role text DEFAULT '프론트';
UPDATE schedule_slots SET role = '매니저' WHERE role = '기타';
