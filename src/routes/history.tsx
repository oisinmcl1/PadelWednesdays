import { Hono } from "hono";
import { raw } from "hono/html";
import { requireAdmin } from "../auth";
import * as db from "../db";
import * as ledger from "../ledger";
import { formatMoney, parseMoney } from "../money";
import * as sessions from "../sessions";
import type { AppEnv } from "../types";
import { standings } from "../stats";
import { Layout, PayButton } from "../views/layout";

const history = new Hono<AppEnv>();

history.get("/", async (c) => {
  const list = await sessions.listEndedSessions(c.env.DB);
  return c.html(
    <Layout title="History" isAdmin={c.get("isAdmin")}>
      <h1>History</h1>
      {list.length === 0 ? (
        <p>No finished sessions yet.</p>
      ) : (
        <ul class="list">
          {list.map((s) => (
            <li>
              <a class="name" href={`/history/${s.id}`}>{sessions.formatDate(s.date)}</a>
              <span class="hint">{s.match_count} matches</span>
            </li>
          ))}
        </ul>
      )}
    </Layout>,
  );
});

history.get("/:id{[0-9]+}", async (c) => {
  const session = await sessions.getSession(c.env.DB, Number(c.req.param("id")));
  if (!session) return c.notFound();
  const [players, matches, shares, settings] = await Promise.all([
    db.listPlayers(c.env.DB),
    sessions.listMatches(c.env.DB, session.id),
    ledger.sessionShares(c.env.DB, session.id),
    db.getSettings(c.env.DB),
  ]);
  const name = new Map(players.map((p) => [p.id, p.name]));
  const team = (x: number, y: number) => `${name.get(x)} & ${name.get(y)}`;
  const isAdmin = c.get("isAdmin");
  const back = `/history/${session.id}`;
  const played = matches.filter((m): m is typeof m & { games_a: number; games_b: number } => m.games_a !== null);
  const recap = {
    iso: session.date,
    date: sessions.formatDate(session.date),
    balls: session.ball_buyer_id !== null ? name.get(session.ball_buyer_id) : null,
    standings: standings(played).map((s) => ({ name: name.get(s.id), wins: s.wins, losses: s.losses, diff: s.diff })),
    results: played.map((m) => ({ a: team(m.a1, m.a2), b: team(m.b1, m.b2), ga: m.games_a, gb: m.games_b })),
  };

  return c.html(
    <Layout title={sessions.formatDate(session.date)} isAdmin={isAdmin}>
      <h1>{sessions.formatDate(session.date)}</h1>
      <p class="hint">
        {shares.map((s) => name.get(s.player_id)).join(", ")}
        {session.ball_buyer_id !== null && <> · Balls: {name.get(session.ball_buyer_id)}</>}
      </p>

      {session.status === "ended" && played.length > 0 && (
        <>
          <button class="big" data-recap>Share recap</button>
          {/* Escape "<" so a player name can't close the script tag. */}
          <script type="application/json" id="recap-data">
            {raw(JSON.stringify(recap).replace(/</g, "\\u003c"))}
          </script>
          <script src="/recap.js" defer></script>
        </>
      )}

      <ol class="results">
        {played.map((m) => (
            <li>
              <span>{team(m.a1, m.a2)}</span>
              <b>{m.games_a}–{m.games_b}</b>
              <span>{team(m.b1, m.b2)}</span>
              {isAdmin && <a href={`/matches/${m.id}/edit`}>Edit</a>}
            </li>
          ))}
      </ol>

      {session.status === "ended" && (
        <section>
          <h2>Court {formatMoney(session.court_price_cents)}</h2>
          <ul class="list">
            {shares.map((s) =>
              s.player_id === session.payer_id ? (
                <li>
                  <span class="name">{name.get(s.player_id)}</span>
                  <span class="hint">{formatMoney(s.share_cents ?? 0)} · paid the court</span>
                </li>
              ) : (
                <li>
                  <span class="name">{name.get(s.player_id)}</span>
                  {/* The amount shows once: on the Pay button when there is one. */}
                  {(s.paid_at || !settings.revolutUrl) && <span>{formatMoney(s.share_cents ?? 0)}</span>}
                  {s.paid_at ? <span class="ok">Paid</span> : <PayButton cents={s.share_cents ?? 0} url={settings.revolutUrl} />}
                  {isAdmin && (
                    <form method="post" action="/money/paid">
                      <input type="hidden" name="session" value={String(session.id)} />
                      <input type="hidden" name="player" value={String(s.player_id)} />
                      <input type="hidden" name="paid" value={s.paid_at ? "0" : "1"} />
                      <input type="hidden" name="back" value={back} />
                      <button class="secondary small">{s.paid_at ? "Unmark" : "Mark paid"}</button>
                    </form>
                  )}
                </li>
              ),
            )}
          </ul>
          {isAdmin && (
            <form method="post" action={`/history/${session.id}/price`} class="row">
              <input name="price" value={formatMoney(session.court_price_cents).slice(1)} inputmode="decimal" aria-label="Court price (£)" />
              <button class="secondary">Change price</button>
            </form>
          )}
        </section>
      )}
      <p><a href="/history">← All sessions</a></p>
    </Layout>,
  );
});

history.post("/:id{[0-9]+}/price", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const cents = parseMoney(String((await c.req.parseBody()).price ?? ""));
  if (cents !== null) await sessions.setSessionPrice(c.env.DB, id, cents);
  return c.redirect(`/history/${id}`, 303);
});

export default history;
