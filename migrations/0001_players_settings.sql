-- Players are never deleted, only deactivated: match history will reference them.
CREATE TABLE players (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  ball_order INTEGER,                 -- position in the ball rotation; NULL = not in it
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Known keys: court_price_cents, revolut_url, payer_player_id.
-- Missing keys fall back to defaults in src/db.ts.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
