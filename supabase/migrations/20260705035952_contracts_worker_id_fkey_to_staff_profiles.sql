ALTER TABLE contracts DROP CONSTRAINT contracts_worker_id_fkey;
ALTER TABLE contracts
  ADD CONSTRAINT contracts_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES staff_profiles(id);
