ALTER TABLE popup_events ADD COLUMN store_id INTEGER REFERENCES stores(id);
