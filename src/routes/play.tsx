import { Hono, type Context } from "hono";
import * as db from "../db";
import { formatEuros, parseEuros } from "../money";
import * as sessions from "../sessions";
import type { AppEnv } from "../types";
import { ErrorText, Layout } from "../views/layout";

const play = new Hono<AppEnv>();

type StartForm = { date: string; price: string; players: string[] };

async function startPage(c: Context<AppEnv>, form: StartForm, error?: string) {
  const players = (await db.listPlayers(c.env.DB)).filter((p) => p.active);
  return c.html(
    <Layout title="Start session" isAdmin={c.get("isAdmin")}>
      <h1>Who's playing?</h1>
      <ErrorText error={error} />
      {players.length < 4 ? (
        <p>
          Add at least 4 players first: <a href="/players">Players</a>.
        </p>
      ) : (
        <form method="post" action="/sessions" class="stack">
          <div class="tiles">
            {players.map((p) => (
              <label class="tile">
                <input type="checkbox" name="players" value={String(p.id)} checked={form.players.includes(String(p.id))} />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
          <p class="hint">Pick 4, 5 or 6.</p>
          <div class="row">
            <label class="grow">
              Date
              <input type="date" name="date" value={form.date} required />
            </label>
            <label class="grow">
              Court (€)
              <input name="price" value={form.price} inputmode="decimal" required />
            </label>
          </div>
          <button class="big">Start session</button>
        </form>
      )}
    </Layout>,
    error ? 400 : 200,
  );
}

async function matchPage(c: Context<AppEnv>, session: sessions.Session) {
  // Normally a no-op; tops up the schedule if results were edited behind our back.
  await sessions.ensureUpcoming(c.env.DB, session.id);
  const [players, matches] = await Promise.all([
    db.listPlayers(c.env.DB),
    sessions.listMatches(c.env.DB, session.id),
  ]);
  const name = new Map(players.map((p) => [p.id, p.name]));
  const names = (...ids: (number | null)[]) =>
    ids.filter((id): id is number => id !== null).map((id) => name.get(id) ?? "?");
  const upcoming = matches.filter((m) => m.games_a === null);
  const [current, next] = upcoming;

  return c.html(
    <Layout title="Padel Wednesdays" isAdmin={c.get("isAdmin")}>
      <p class="hint">
        {formatDate(session.date)} · Match {current.seq}
      </p>
      <section class="match current" aria-label="Current match">
        <div class="team">{names(current.a1, current.a2).map((n) => <span>{n}</span>)}</div>
        <div class="vs">vs</div>
        <div class="team">{names(current.b1, current.b2).map((n) => <span>{n}</span>)}</div>
        {current.sit1 !== null && <p class="sitting">Sitting out: {names(current.sit1, current.sit2).join(" & ")}</p>}
      </section>
      {next && (
        <section class="match next" aria-label="Next match">
          <h2>Next</h2>
          <p>
            {names(next.a1, next.a2).join(" & ")} <span class="vs">vs</span> {names(next.b1, next.b2).join(" & ")}
          </p>
          {next.sit1 !== null && <p class="sitting">Sitting out: {names(next.sit1, next.sit2).join(" & ")}</p>}
        </section>
      )}
      <p class="end-link">
        <a href="/sessions/end">End session</a>
      </p>
    </Layout>,
  );
}

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });

play.get("/", async (c) => {
  const session = await sessions.getActiveSession(c.env.DB);
  if (session) return matchPage(c, session);
  const settings = await db.getSettings(c.env.DB);
  return startPage(c, {
    date: sessions.todayInIreland(),
    price: formatEuros(settings.courtPriceCents).slice(1),
    players: [],
  });
});

play.post("/sessions", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const ids = [body.players ?? []].flat().map(String);
  const form: StartForm = { date: String(body.date ?? ""), price: String(body.price ?? ""), players: ids };

  const active = new Set((await db.listPlayers(c.env.DB)).filter((p) => p.active).map((p) => String(p.id)));
  const chosen = [...new Set(ids)].filter((id) => active.has(id));
  if (chosen.length < 4 || chosen.length > 6) return startPage(c, form, `Pick 4, 5 or 6 players (you picked ${chosen.length}).`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return startPage(c, form, "Pick a date.");
  const cents = parseEuros(form.price);
  if (cents === null) return startPage(c, form, "Court price should look like 40 or 42.50.");

  await sessions.startSession(c.env.DB, form.date, cents, chosen.map(Number));
  // If someone else started one at the same moment, theirs wins; either way go to it.
  return c.redirect("/", 303);
});

play.get("/sessions/end", async (c) => {
  const session = await sessions.getActiveSession(c.env.DB);
  if (!session) return c.redirect("/");
  return c.html(
    <Layout title="End session" isAdmin={c.get("isAdmin")}>
      <h1>End the session?</h1>
      <p>Unplayed matches will be dropped. If no results were logged, the session is deleted.</p>
      <form method="post" action="/sessions/end" class="stack">
        <input type="hidden" name="id" value={String(session.id)} />
        <button class="big">End session</button>
        <a href="/" class="button secondary">Keep playing</a>
      </form>
    </Layout>,
  );
});

play.post("/sessions/end", async (c) => {
  const session = await sessions.getActiveSession(c.env.DB);
  // The id guards against ending a session someone else just started.
  if (session && String(session.id) === String((await c.req.parseBody()).id)) {
    await sessions.endSession(c.env.DB, session.id);
  }
  return c.redirect("/", 303);
});

export default play;
