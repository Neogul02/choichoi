
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id integer NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  popup_id integer REFERENCES popup_events(id),
  start_date date NOT NULL,
  end_date date,
  hourly_rate integer NOT NULL,
  work_schedule text,
  workplace text,
  pdf_url text,
  pdf_hash text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_worker_id ON contracts(worker_id);
CREATE INDEX IF NOT EXISTS idx_contracts_popup_id ON contracts(popup_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;
