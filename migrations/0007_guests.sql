-- Guests play the odd week. They're stored as inactive players so they stay out of the
-- attendance list, ball rotation and leaderboard, but keep their history if they come back.
ALTER TABLE players ADD COLUMN guest INTEGER NOT NULL DEFAULT 0 CHECK (guest IN (0, 1));
