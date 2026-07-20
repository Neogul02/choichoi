ALTER TABLE memos ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'note' CHECK (type IN ('note', 'checklist'));
