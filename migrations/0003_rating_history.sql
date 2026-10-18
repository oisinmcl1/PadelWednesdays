-- Each player's openskill rating after each played match. A cache: it can always be
-- rebuilt from matches (see src/ratings.ts), which is what makes editing old results safe.
CREATE TABLE rating_history (
  match_id  INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id),
  mu        REAL    NOT NULL,
  sigma     REAL    NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
