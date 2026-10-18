import { Hono } from "hono";
import * as db from "../db";
import { formatEuros } from "../money";
import * as sessions from "../sessions";
import type { AppEnv } from "../types";
import { Layout } from "../views/layout";

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
  const [players, matches, attendees] = await Promise.all([
    db.listPlayers(c.env.DB),
    sessions.listMatches(c.env.DB, session.id),
    sessions.sessionPlayerIds(c.env.DB, session.id),
  ]);
  const name = new Map(players.map((p) => [p.id, p.name]));
  const team = (x: number, y: number) => `${name.get(x)} & ${name.get(y)}`;
  const isAdmin = c.get("isAdmin");
  return c.html(
    <Layout title={sessions.formatDate(session.date)} isAdmin={isAdmin}>
      <h1>{sessions.formatDate(session.date)}</h1>
      <p class="hint">
        {attendees.map((id) => name.get(id)).join(", ")} · Court {formatEuros(session.court_price_cents)}
      </p>
      <ol class="results">
        {matches
          .filter((m) => m.games_a !== null)
          .map((m) => (
            <li>
              <span>{team(m.a1, m.a2)}</span>
              <b>{m.games_a}–{m.games_b}</b>
              <span>{team(m.b1, m.b2)}</span>
              {isAdmin && <a href={`/matches/${m.id}/edit`}>Edit</a>}
            </li>
          ))}
      </ol>
      <p><a href="/history">← All sessions</a></p>
    </Layout>,
  );
});

export default history;
