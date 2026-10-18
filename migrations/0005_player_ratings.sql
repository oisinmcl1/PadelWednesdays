-- Each player's current rating: a snapshot of their latest rating_history row,
-- rewritten whenever ratings are rebuilt. Lets the match screen (which every
-- phone refreshes every 15s) read a handful of rows instead of the whole history.
CREATE TABLE player_ratings (
  player_id INTEGER PRIMARY KEY REFERENCES players(id),
  mu        REAL NOT NULL,
  sigma     REAL NOT NULL
);
