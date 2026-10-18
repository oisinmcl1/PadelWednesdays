import { Hono, type Context } from "hono";
import { requireAdmin } from "../auth";
import * as db from "../db";
import { currentRatings, winChance } from "../ratings";
import { formatMoney, parseMoney, splitCost } from "../money";
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
          Need at least 4 <a href="/players">players</a>.
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
          <div class="row">
            <label class="grow">
              Date
              <input type="date" name="date" value={form.date} required />
            </label>
            <label class="grow">
              Court (£)
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
  const isAdmin = c.get("isAdmin");
  const name = new Map(players.map((p) => [p.id, p.name]));
  const names = (...ids: (number | null)[]) =>
    ids.filter((id): id is number => id !== null).map((id) => name.get(id) ?? "?");
  const played = matches.filter((m) => m.games_a !== null);
  const [current, next] = matches.filter((m) => m.games_a === null);
  const last = played.at(-1);
  const ballTurn = await sessions.ballTurnFor(c.env.DB, session.id);
  const ratings = await currentRatings(c.env.DB, await sessions.sessionPlayerIds(c.env.DB, session.id));

  /** Win % for each team, or null while none of the four has played a rated match. */
  const odds = (m: sessions.MatchRow): [number, number] | null => {
    if (![m.a1, m.a2, m.b1, m.b2].some((id) => ratings.has(id))) return null;
    const a = Math.round(100 * winChance(ratings, [m.a1, m.a2], [m.b1, m.b2]));
    return [a, 100 - a];
  };
  const currentOdds = odds(current);
  const nextOdds = next ? odds(next) : null;

  const ScoreTiles = ({ team }: { team: "a" | "b" }) => (
    <div class="score-tiles" role="radiogroup" aria-label={`Games for team ${team.toUpperCase()}`}>
      {Array.from({ length: sessions.WIN_GAMES + 1 }, (_, n) => (
        <label class="tile">
          <input type="radio" name={team} value={String(n)} required />
          <span>{n}</span>
        </label>
      ))}
    </div>
  );

  return c.html(
    <Layout title="Padel Wednesdays" isAdmin={isAdmin}>
      {/* Refreshes every 15s so all phones stay in step, unless you're mid-way through entering a score. */}
      <div
        id="play"
        hx-get="/"
        hx-trigger="every 15s [!document.querySelector('#play input:checked')]"
        hx-select="#play"
        hx-swap="outerHTML"
      >
        <p class="hint">
          {formatDate(session.date)} · Match {current.seq}
          {ballTurn !== null && <> · Balls: {name.get(ballTurn)}</>}
        </p>
        {c.req.query("bad") === "1" && (
          <p class="error" role="alert">
            Not a valid score.
          </p>
        )}
        <form
          method="post"
          action={`/matches/${current.id}/result`}
          class="match current"
          data-score-form
          data-first-to={String(sessions.WIN_GAMES)}
          data-team-a={names(current.a1, current.a2).join(" & ")}
          data-team-b={names(current.b1, current.b2).join(" & ")}
        >
          <div class="team">{names(current.a1, current.a2).map((n) => <span>{n}</span>)}</div>
          {currentOdds && <p class="odds">{currentOdds[0]}% to win</p>}
          <ScoreTiles team="a" />
          <div class="vs">vs</div>
          <div class="team">{names(current.b1, current.b2).map((n) => <span>{n}</span>)}</div>
          {currentOdds && <p class="odds">{currentOdds[1]}% to win</p>}
          <ScoreTiles team="b" />
          {current.sit1 !== null && <p class="sitting">Sitting out: {names(current.sit1, current.sit2).join(" & ")}</p>}
          <button class="save" data-save>Save result</button>
        </form>

        {last && (
          <form method="post" action={`/matches/${last.id}/undo`} class="last">
            <span>
              Last: {names(last.a1, last.a2).join(" & ")} <b>{last.games_a}–{last.games_b}</b> {names(last.b1, last.b2).join(" & ")}
            </span>
            <button class="secondary small">Undo</button>
          </form>
        )}

        {next && (
          <section class="match next" aria-label="Next match">
            <h2>Next</h2>
            <p>
              {names(next.a1, next.a2).join(" & ")}
              {nextOdds && <span class="odds"> {nextOdds[0]}%</span>} <span class="vs">vs</span>{" "}
              {names(next.b1, next.b2).join(" & ")}
              {nextOdds && <span class="odds"> {nextOdds[1]}%</span>}
            </p>
            {next.sit1 !== null && <p class="sitting">Sitting out: {names(next.sit1, next.sit2).join(" & ")}</p>}
          </section>
        )}

        {played.length > 0 && (
          <section>
            <h2>Tonight</h2>
            <ol class="results">
              {played.map((m) => (
                <li>
                  <span>{names(m.a1, m.a2).join(" & ")}</span>
                  <b>{m.games_a}–{m.games_b}</b>
                  <span>{names(m.b1, m.b2).join(" & ")}</span>
                  {isAdmin && <a href={`/matches/${m.id}/edit`}>Edit</a>}
                </li>
              ))}
            </ol>
          </section>
        )}

        <p class="end-link">
          <a href="/sessions/end">End session</a>
        </p>
      </div>
    </Layout>,
  );
}

const formatDate = sessions.formatDate;

play.get("/", async (c) => {
  const session = await sessions.getActiveSession(c.env.DB);
  if (session) return matchPage(c, session);
  const settings = await db.getSettings(c.env.DB);
  return startPage(c, {
    date: sessions.todayInIreland(),
    price: formatMoney(settings.courtPriceCents).slice(1),
    players: [],
  });
});

play.post("/sessions", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const ids = [body.players ?? []].flat().map(String);
  const form: StartForm = { date: String(body.date ?? ""), price: String(body.price ?? ""), players: ids };

  const active = new Set((await db.listPlayers(c.env.DB)).filter((p) => p.active).map((p) => String(p.id)));
  const chosen = [...new Set(ids)].filter((id) => active.has(id));
  if (chosen.length < 4 || chosen.length > 6) return startPage(c, form, "Pick 4, 5 or 6 players.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return startPage(c, form, "Pick a date.");
  const cents = parseMoney(form.price);
  if (cents === null) return startPage(c, form, "Invalid price.");

  await sessions.startSession(c.env.DB, form.date, cents, chosen.map(Number));
  // If someone else started one at the same moment, theirs wins; either way go to it.
  return c.redirect("/", 303);
});

play.get("/sessions/end", async (c) => {
  const session = await sessions.getActiveSession(c.env.DB);
  if (!session) return c.redirect("/");
  const [players, attendees, settings, turn] = await Promise.all([
    db.listPlayers(c.env.DB),
    sessions.sessionPlayerIds(c.env.DB, session.id),
    db.getSettings(c.env.DB),
    sessions.ballTurnFor(c.env.DB, session.id),
  ]);
  const name = new Map(players.map((p) => [p.id, p.name]));
  const shares = splitCost(session.court_price_cents, attendees, settings.payerPlayerId);
  const payerName = settings.payerPlayerId !== null ? name.get(settings.payerPlayerId) : undefined;
  const owing = attendees.filter((id) => id !== settings.payerPlayerId);

  return c.html(
    <Layout title="End session" isAdmin={c.get("isAdmin")}>
      <h1>End the session?</h1>
      <form method="post" action="/sessions/end" class="stack">
        <input type="hidden" name="id" value={String(session.id)} />
        <section class="card">
          <h2>Court {formatMoney(session.court_price_cents)}</h2>
          <ul class="plain">
            {owing.map((id) => (
              <li>
                {name.get(id)} owes {payerName ?? "the payer"} <b>{formatMoney(shares.get(id)!)}</b>
              </li>
            ))}
          </ul>
          {!payerName && <p class="error">No court payer set in Settings.</p>}
        </section>
        <label>
          Who brought the balls?
          <select name="balls">
            {attendees.map((id) => (
              <option value={String(id)} selected={id === turn}>
                {name.get(id)}{id === turn ? " (their turn)" : ""}
              </option>
            ))}
            <option value="" selected={turn === null}>Nobody / not tracked</option>
          </select>
        </label>
        <button class="big">End session</button>
        <a href="/" class="button secondary">Keep playing</a>
      </form>
    </Layout>,
  );
});

play.post("/sessions/end", async (c) => {
  const session = await sessions.getActiveSession(c.env.DB);
  const body = await c.req.parseBody();
  // The id guards against ending a session someone else just started.
  if (!session || String(session.id) !== String(body.id)) return c.redirect("/", 303);
  const attendees = await sessions.sessionPlayerIds(c.env.DB, session.id);
  const balls = Number(body.balls);
  const ballBuyer = attendees.includes(balls) ? balls : null;
  const { payerPlayerId } = await db.getSettings(c.env.DB);
  const outcome = await sessions.endSession(c.env.DB, session.id, ballBuyer, payerPlayerId);
  return c.redirect(outcome === "ended" ? `/history/${session.id}` : "/", 303);
});

play.post("/matches/:id{[0-9]+}/result", async (c) => {
  const body = await c.req.parseBody();
  const games = sessions.parseGames(body.a, body.b);
  if (!games) return c.redirect("/?bad=1", 303);
  await sessions.logResult(c.env.DB, Number(c.req.param("id")), games);
  return c.redirect("/", 303);
});

play.post("/matches/:id{[0-9]+}/undo", async (c) => {
  const session = await sessions.getActiveSession(c.env.DB);
  if (session) await sessions.undoLastResult(c.env.DB, session.id, Number(c.req.param("id")));
  return c.redirect("/", 303);
});

play.get("/matches/:id{[0-9]+}/edit", requireAdmin, async (c) => {
  const match = await sessions.getMatch(c.env.DB, Number(c.req.param("id")));
  if (!match || match.games_a === null) return c.notFound();
  return editPage(c, match);
});

play.post("/matches/:id{[0-9]+}/edit", requireAdmin, async (c) => {
  const match = await sessions.getMatch(c.env.DB, Number(c.req.param("id")));
  if (!match || match.games_a === null) return c.notFound();
  const body = await c.req.parseBody();
  const games = sessions.parseGames(body.a, body.b);
  if (!games) return editPage(c, match, "Not a valid score.");
  await sessions.editResult(c.env.DB, match.id, games);
  return c.redirect(await backFromEdit(c.env.DB, match.session_id), 303);
});

/** Back to the match screen for tonight's session, or to that session's history page. */
async function backFromEdit(d: D1Database, sessionId: number) {
  const active = await sessions.getActiveSession(d);
  return active?.id === sessionId ? "/" : `/history/${sessionId}`;
}

async function editPage(c: Context<AppEnv>, m: sessions.MatchRow & { session_id: number }, error?: string) {
  const players = await db.listPlayers(c.env.DB);
  const name = new Map(players.map((p) => [p.id, p.name]));
  const team = (x: number, y: number) => `${name.get(x)} & ${name.get(y)}`;
  return c.html(
    <Layout title="Edit result" isAdmin={true}>
      <h1>Edit result</h1>
      <ErrorText error={error} />
      <form method="post" class="stack">
        <label>
          {team(m.a1, m.a2)}
          <input name="a" value={String(m.games_a)} inputmode="numeric" pattern="[0-9]" required />
        </label>
        <label>
          {team(m.b1, m.b2)}
          <input name="b" value={String(m.games_b)} inputmode="numeric" pattern="[0-9]" required />
        </label>
        <button class="big">Save</button>
        <a href={await backFromEdit(c.env.DB, m.session_id)} class="button secondary">Cancel</a>
      </form>
    </Layout>,
    error ? 400 : 200,
  );
}

export default play;
