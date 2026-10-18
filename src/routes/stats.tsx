import { Hono } from "hono";
import { raw } from "hono/html";
import * as db from "../db";
import { displayRating, latestRatings, ratingRowsInOrder, ratingTimeline } from "../ratings";
import { formatDate, playedMatches } from "../sessions";
import * as stats from "../stats";
import type { AppEnv } from "../types";
import { Layout } from "../views/layout";

const statsRoutes = new Hono<AppEnv>();

/** Diverging cell colour for a win %: blue above 50, red below, grey at 50. */
function heat(pct: number) {
  // Full strength at 80% / 20%; capped at 60% colour so the number on top stays readable.
  const strength = Math.min(Math.abs(pct - 50) / 30, 1) * 0.6;
  return `--t: ${strength.toFixed(2)}`;
}

statsRoutes.get("/", async (c) => {
  const [players, matches] = await Promise.all([db.listPlayers(c.env.DB), playedMatches(c.env.DB)]);
  const recs = stats.records(matches);
  const people = players.filter((p) => recs.has(p.id));
  const pairs = stats.partnerships(matches);

  return c.html(
    <Layout title="Stats" isAdmin={c.get("isAdmin")}>
      <h1>Stats</h1>
      {people.length === 0 ? (
        <p>No results yet.</p>
      ) : (
        <>
          <ul class="chips">
            {people.map((p) => (
              <li>
                <a href={`/stats/${p.id}`}>{p.name}</a>
              </li>
            ))}
          </ul>

          <h2>Partnerships</h2>
          <p class="hint">Win % together. Grey: under {stats.MIN_GAMES} matches.</p>
          <div class="table-wrap">
            <table class="heatmap">
              <thead>
                <tr>
                  <th></th>
                  {people.map((p) => (
                    <th scope="col">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((row) => (
                  <tr>
                    <th scope="row">{row.name}</th>
                    {people.map((col) => {
                      if (row.id === col.id) return <td class="self"></td>;
                      const r = pairs.get(stats.pairKey(row.id, col.id));
                      if (!r) return <td class="none">–</td>;
                      const label = `${row.name} & ${col.name}: won ${r.wins} of ${r.played}`;
                      if (r.played < stats.MIN_GAMES) return <td class="few" title={label}>{r.played}</td>;
                      const pct = stats.winPct(r);
                      return (
                        <td class={pct >= 50 ? "pos" : "neg"} style={heat(pct)} title={label}>
                          {pct}%
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>,
  );
});

statsRoutes.get("/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const [players, matches, ratingRows, timeline] = await Promise.all([
    db.listPlayers(c.env.DB),
    playedMatches(c.env.DB),
    ratingRowsInOrder(c.env.DB),
    ratingTimeline(c.env.DB),
  ]);
  const player = players.find((p) => p.id === id);
  if (!player) return c.notFound();
  const name = new Map(players.map((p) => [p.id, p.name]));

  const rec = stats.records(matches).get(id);
  const rating = latestRatings(ratingRows).get(id);
  const streak = stats.streak(matches, id);
  const { partners, opponents } = stats.headToHead(matches, id);
  const best = stats.bestPartner(partners);
  const nemesis = stats.nemesis(opponents);
  const trend = timeline.filter((t) => t.player_id === id);
  const byPlayed = (m: Map<number, stats.Record>) => [...m].sort((a, b) => b[1].played - a[1].played);

  return c.html(
    <Layout title={player.name} isAdmin={c.get("isAdmin")} charts={trend.length > 1}>
      <h1>{player.name}</h1>
      {!rec || !rating ? (
        <p>No results yet.</p>
      ) : (
        <>
          <div class="tiles-stats">
            <div><b>{displayRating(rating).toFixed(1)}</b><span>Rating</span></div>
            <div><b>{rec.played}</b><span>Played</span></div>
            <div><b>{stats.winPct(rec)}%</b><span>Won ({rec.wins})</span></div>
            <div><b>{streak ? `${streak.kind}${streak.length}` : "–"}</b><span>Streak</span></div>
          </div>
          <p class="hint">
            {rec.wins} won · {rec.losses} lost
          </p>

          <div class="facts">
            <p>
              Best partner:{" "}
              {best ? (
                <b>
                  {name.get(best.id)} ({best.record.wins} of {best.record.played} won)
                </b>
              ) : (
                <span class="hint">–</span>
              )}
            </p>
            <p>
              Nemesis:{" "}
              {nemesis ? (
                <b>
                  {name.get(nemesis.id)} ({nemesis.record.losses} of {nemesis.record.played} lost)
                </b>
              ) : (
                <span class="hint">–</span>
              )}
            </p>
          </div>

          {trend.length > 1 && (
            <section class="chart-card">
              <h2>Rating after each session</h2>
              <div class="chart-box">
                <canvas data-line-chart aria-label={`${player.name}'s rating after each session`} role="img"></canvas>
                {/* Chart data is JSON; escape "<" so a player name can't close the script tag. */}
                <script type="application/json">
                  {raw(
                    JSON.stringify({ labels: trend.map((t) => formatDate(t.date)), values: trend.map((t) => t.rating) })
                      .replace(/</g, "\\u003c"),
                  )}
                </script>
              </div>
              <details>
                <summary>Show as table</summary>
                <table class="table">
                  <tbody>
                    {trend.map((t) => (
                      <tr>
                        <td class="left">{formatDate(t.date)}</td>
                        <td>{t.rating.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          )}

          <h2>Partners</h2>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th class="left">With</th><th>Played</th><th>Won</th><th>Win %</th></tr>
              </thead>
              <tbody>
                {byPlayed(partners).map(([pid, r]) => (
                  <tr>
                    <td class="left"><a href={`/stats/${pid}`}>{name.get(pid)}</a></td>
                    <td>{r.played}</td><td>{r.wins}</td><td>{stats.winPct(r)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Head to head</h2>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th class="left">Against</th><th>Played</th><th>Won</th><th>Lost</th></tr>
              </thead>
              <tbody>
                {byPlayed(opponents).map(([pid, r]) => (
                  <tr>
                    <td class="left"><a href={`/stats/${pid}`}>{name.get(pid)}</a></td>
                    <td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p><a href="/stats">← All stats</a></p>
    </Layout>,
  );
});

export default statsRoutes;
