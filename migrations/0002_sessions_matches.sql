CREATE TABLE sessions (
  id                INTEGER PRIMARY KEY,
  date              TEXT    NOT NULL,                -- YYYY-MM-DD, Irish time
  court_price_cents INTEGER NOT NULL CHECK (court_price_cents >= 0),
  ball_buyer_id     INTEGER REFERENCES players(id),  -- set when the session ends
  status            TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- At most one session in progress at a time.
CREATE UNIQUE INDEX sessions_one_active ON sessions(status) WHERE status = 'active';

CREATE TABLE session_players (
  session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  share_cents INTEGER,   -- set when the session ends
  paid_at     TEXT,
  PRIMARY KEY (session_id, player_id)
);

-- Matches are scheduled a cycle at a time; games_a/games_b stay NULL until played.
-- With 6 players two people sit out, hence sit1 and sit2.
CREATE TABLE matches (
  id         INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,   -- 1, 2, 3... within the session
  cycle      INTEGER NOT NULL,   -- 1, 2, 3... within the session
  a1         INTEGER NOT NULL REFERENCES players(id),
  a2         INTEGER NOT NULL REFERENCES players(id),
  b1         INTEGER NOT NULL REFERENCES players(id),
  b2         INTEGER NOT NULL REFERENCES players(id),
  sit1       INTEGER REFERENCES players(id),
  sit2       INTEGER REFERENCES players(id),
  games_a    INTEGER CHECK (games_a >= 0),
  games_b    INTEGER CHECK (games_b >= 0),
  played_at  TEXT,
  UNIQUE (session_id, seq)
);
CREATE INDEX matches_session ON matches(session_id, seq);
