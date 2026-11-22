-- Matches are best of 3 sets, each first to 5 games. Set scores live in `sets`;
-- matches.sets_a/sets_b hold the sets won and stay NULL until the match is decided.
CREATE TABLE sets (
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  n        INTEGER NOT NULL CHECK (n BETWEEN 1 AND 3),
  games_a  INTEGER NOT NULL CHECK (games_a >= 0),
  games_b  INTEGER NOT NULL CHECK (games_b >= 0),
  PRIMARY KEY (match_id, n)
);

-- Results logged before this were single sets: keep them as one-set matches.
INSERT INTO sets (match_id, n, games_a, games_b)
  SELECT id, 1, games_a, games_b FROM matches WHERE games_a IS NOT NULL;

ALTER TABLE matches RENAME COLUMN games_a TO sets_a;
ALTER TABLE matches RENAME COLUMN games_b TO sets_b;
UPDATE matches SET sets_a = (sets_a > sets_b), sets_b = (sets_b > sets_a) WHERE sets_a IS NOT NULL;
