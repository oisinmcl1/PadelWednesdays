-- Who paid for the court for this session (copied from settings when it ends),
-- so changing the setting later doesn't rewrite who owed whom.
ALTER TABLE sessions ADD COLUMN payer_id INTEGER REFERENCES players(id);
