import { Hono } from "hono";
import * as db from "../db";
import { applyMatches, displayRating, latestRatings, ratingRowsInOrder } from "../ratings";
import { playedMatches } from "../sessions";
import { formatSeason, records, seasonOf, winPct } from "../stats";
import type { AppEnv } from "../types";
import { Layout } from "../views/layout";

const leaderboard = new Hono<AppEnv>();

// All-time uses the stored ratings. A season (calendar month) gets a fresh openskill
// rating from just that month's matches, so everyone starts level each month.
leaderboard.get("/", async (c) => {
  const [players, allMatches] = await Promise.all([db.listPlayers(c.env.DB), playedMatches(c.env.DB)]);
  const seasons = [...new Set(allMatches.map((m) => seasonOf(m.date)))].reverse();
  const season = seasons.includes(c.req.query("season") ?? "") ? c.req.query("season")! : null;

  const matches = season ? allMatches.filter((m) => seasonOf(m.date) === season) : allMatches;
  const ratings = season
    ? latestRatings(applyMatches(new Map(), matches))
    : latestRatings(await ratingRowsInOrder(c.env.DB));
  const recs = records(matches);
  const rows = players
    .filter((p) => recs.has(p.id) && ratings.has(p.id))
    .map((p) => ({ ...p, rating: displayRating(ratings.get(p.id)!), rec: recs.get(p.id)! }))
    .sort((x, y) => y.rating - x.rating);

  return c.html(
    <Layout title="Leaderboard" isAdmin={c.get("isAdmin")}>
      <h1>{season ? formatSeason(season) : "All-time"}</h1>
      {seasons.length > 0 && (
        <nav class="tabs" aria-label="Season">
          <a href="/leaderboard" aria-current={season ? undefined : "page"}>All-time</a>
          {seasons.map((s) => (
            <a href={`/leaderboard?season=${s}`} aria-current={s === season ? "page" : undefined}>
              {formatSeason(s)}
            </a>
          ))}
        </nav>
      )}
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
                  <td class="left">
                    <a href={`/stats/${r.id}`}>{r.name}</a>
                  </td>
                  <td>
                    <b>{r.rating.toFixed(1)}</b>
                  </td>
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
        Rating is openskill's cautious estimate of your level: everyone starts at 0, and it settles as you play more.
        {season && " Monthly tables start everyone fresh at the start of the month."}
      </p>
    </Layout>,
  );
});

export default leaderboard;
