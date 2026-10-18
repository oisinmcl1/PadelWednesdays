import { Hono } from "hono";
import * as db from "../db";
import { displayRating, latestRatings, ratingRowsInOrder } from "../ratings";
import { playedMatches } from "../sessions";
import { records, winPct } from "../stats";
import type { AppEnv } from "../types";
import { Layout } from "../views/layout";

const leaderboard = new Hono<AppEnv>();

leaderboard.get("/", async (c) => {
  const [players, matches, ratingRows] = await Promise.all([
    db.listPlayers(c.env.DB),
    playedMatches(c.env.DB),
    ratingRowsInOrder(c.env.DB),
  ]);
  const ratings = latestRatings(ratingRows);
  const recs = records(matches);
  const rows = players
    .filter((p) => recs.has(p.id) && ratings.has(p.id))
    .map((p) => ({ ...p, rating: displayRating(ratings.get(p.id)!), rec: recs.get(p.id)! }))
    .sort((x, y) => y.rating - x.rating);

  return c.html(
    <Layout title="Leaderboard" isAdmin={c.get("isAdmin")}>
      <h1>Leaderboard</h1>
      {rows.length === 0 ? (
        <p>No results yet.</p>
      ) : (
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th class="left">Player</th>
                <th>Rating</th>
                <th>Played</th>
                <th>Won</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr class={r.active ? "" : "muted"}>
                  <td>{i + 1}</td>
                  <td class="left">{r.name}</td>
                  <td><b>{r.rating.toFixed(1)}</b></td>
                  <td>{r.rec.played}</td>
                  <td>{r.rec.wins}</td>
                  <td>{winPct(r.rec)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p class="hint">
        Rating is openskill's cautious estimate of your level: everyone starts at 0, and it settles as you play
        more. Teammates share the credit for a win, weighted by who was expected to win.
      </p>
    </Layout>,
  );
});

export default leaderboard;
