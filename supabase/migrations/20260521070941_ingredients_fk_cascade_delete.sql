
-- recipes: ingredient_id FK → cascade
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_ingredient_id_fkey;
ALTER TABLE recipes
  ADD CONSTRAINT recipes_ingredient_id_fkey
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;

-- restock_events: ingredient_id FK → cascade
ALTER TABLE restock_events DROP CONSTRAINT IF EXISTS restock_events_ingredient_id_fkey;
ALTER TABLE restock_events
  ADD CONSTRAINT restock_events_ingredient_id_fkey
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;

-- deduction_events: ingredient_id FK → cascade
ALTER TABLE deduction_events DROP CONSTRAINT IF EXISTS deduction_events_ingredient_id_fkey;
ALTER TABLE deduction_events
  ADD CONSTRAINT deduction_events_ingredient_id_fkey
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;
